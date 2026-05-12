package edu.nitte.keycloak;

import org.jboss.logging.Logger;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.admin.AdminEvent;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/**
 * Keycloak Event Listener that forwards security and admin events
 * to the NITTE Notification Service via HTTP POST.
 */
public class NotificationEventListenerProvider implements EventListenerProvider {

    private static final Logger logger = Logger.getLogger(NotificationEventListenerProvider.class);

    private final HttpClient httpClient;
    private final String notificationEndpoint;
    private final int timeoutSeconds;

    public NotificationEventListenerProvider(String notificationEndpoint, int timeoutSeconds) {
        this.notificationEndpoint = notificationEndpoint;
        this.timeoutSeconds = timeoutSeconds;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(timeoutSeconds))
                .build();
    }

    @Override
    public void onEvent(Event event) {
        if (!shouldForwardUserEvent(event)) {
            return;
        }

        String payload = buildUserEventPayload(event);
        sendAsync(payload, "user");
    }

    @Override
    public void onEvent(AdminEvent adminEvent, boolean includeRepresentation) {
        if (!shouldForwardAdminEvent(adminEvent)) {
            return;
        }

        String payload = buildAdminEventPayload(adminEvent, includeRepresentation);
        sendAsync(payload, "admin");
    }

    @Override
    public void close() {
        // HttpClient does not require explicit close
    }

    private boolean shouldForwardUserEvent(Event event) {
        String type = event.getType() != null ? event.getType().name() : "";
        return type.contains("LOGIN_ERROR")
                || type.contains("UPDATE_PASSWORD")
                || type.contains("REMOVE")
                || type.contains("REGISTER")
                || type.contains("DELETE")
                || type.contains("CLIENT")
                || type.contains("REALM")
                || type.contains("TOKEN")
                || type.contains("IDENTITY_PROVIDER");
    }

    private boolean shouldForwardAdminEvent(AdminEvent event) {
        String resourceType = event.getResourceType() != null ? event.getResourceType().name() : "";
        String operation = event.getOperationType() != null ? event.getOperationType().name() : "";
        return resourceType.contains("USER")
                || resourceType.contains("REALM")
                || resourceType.contains("ROLE")
                || resourceType.contains("CLIENT")
                || resourceType.contains("GROUP")
                || resourceType.contains("AUTHENTICATION")
                || operation.contains("CREATE")
                || operation.contains("DELETE")
                || operation.contains("UPDATE");
    }

    private String buildUserEventPayload(Event event) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"eventType\":\"").append(escapeJson(event.getType().name())).append("\",");
        sb.append("\"eventCategory\":\"user\",");
        sb.append("\"realmId\":\"").append(escapeJson(event.getRealmId())).append("\",");
        sb.append("\"clientId\":\"").append(escapeJson(event.getClientId())).append("\",");
        sb.append("\"userId\":\"").append(escapeJson(event.getUserId())).append("\",");
        sb.append("\"ipAddress\":\"").append(escapeJson(event.getIpAddress())).append("\",");
        sb.append("\"error\":\"").append(escapeJson(event.getError())).append("\",");
        sb.append("\"details\":").append(mapToJson(event.getDetails()));
        sb.append("}");
        return sb.toString();
    }

    private String buildAdminEventPayload(AdminEvent event, boolean includeRepresentation) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"eventType\":\"").append(escapeJson(event.getOperationType().name())).append("\",");
        sb.append("\"eventCategory\":\"admin\",");
        sb.append("\"realmId\":\"").append(escapeJson(event.getAuthDetails().getRealmId())).append("\",");
        sb.append("\"clientId\":\"").append(escapeJson(event.getAuthDetails().getClientId())).append("\",");
        sb.append("\"userId\":\"").append(escapeJson(event.getAuthDetails().getUserId())).append("\",");
        sb.append("\"ipAddress\":\"").append(escapeJson(event.getAuthDetails().getIpAddress())).append("\",");
        sb.append("\"resourceType\":\"").append(escapeJson(event.getResourceType().name())).append("\",");
        sb.append("\"resourcePath\":\"").append(escapeJson(event.getResourcePath())).append("\",");
        sb.append("\"representation\":\"").append(escapeJson(includeRepresentation ? event.getRepresentation() : "")).append("\",");
        sb.append("\"error\":\"").append(escapeJson(event.getError())).append("\"");
        sb.append("}");
        return sb.toString();
    }

    private void sendAsync(String payload, String category) {
        if (notificationEndpoint == null || notificationEndpoint.isBlank()) {
            logger.debugf("Notification endpoint not configured; skipping %s event", category);
            return;
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(notificationEndpoint))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Content-Type", "application/json")
                    .header("X-Event-Category", category)
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(
                    request, HttpResponse.BodyHandlers.ofString());

            future.whenComplete((response, throwable) -> {
                if (throwable != null) {
                    logger.warnf(throwable, "Failed to send %s event to notification service", category);
                } else if (response.statusCode() >= 400) {
                    logger.warnf("Notification service returned HTTP %d for %s event", response.statusCode(), category);
                } else {
                    logger.tracef("Sent %s event to notification service (HTTP %d)", category, response.statusCode());
                }
            });
        } catch (Exception e) {
            logger.warnf(e, "Unexpected error sending %s event", category);
        }
    }

    private static String escapeJson(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (char c : input.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < ' ') {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }

    private static String mapToJson(java.util.Map<String, String> map) {
        if (map == null || map.isEmpty()) {
            return "{}";
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (java.util.Map.Entry<String, String> entry : map.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\"").append(escapeJson(entry.getKey())).append("\":\"").append(escapeJson(entry.getValue())).append("\"");
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }
}
