package edu.nitte.keycloak;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * Factory for the NITTE Notification Event Listener.
 */
public class NotificationEventListenerProviderFactory implements EventListenerProviderFactory {

    public static final String ID = "nitte-notification-event-listener";

    private String notificationEndpoint;
    private int timeoutSeconds;

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new NotificationEventListenerProvider(notificationEndpoint, timeoutSeconds);
    }

    @Override
    public void init(Config.Scope config) {
        // Prefer environment variable, fallback to config scope, then default
        String envEndpoint = System.getenv("NOTIFICATION_SERVICE_URL");
        if (envEndpoint != null && !envEndpoint.isBlank()) {
            notificationEndpoint = envEndpoint;
        } else {
            notificationEndpoint = config.get("notificationEndpoint", "http://notification-service:9100/api/v1/events");
        }

        String envTimeout = System.getenv("NOTIFICATION_TIMEOUT_SECONDS");
        if (envTimeout != null && !envTimeout.isBlank()) {
            try {
                timeoutSeconds = Integer.parseInt(envTimeout);
            } catch (NumberFormatException e) {
                timeoutSeconds = 5;
            }
        } else {
            timeoutSeconds = config.getInt("timeoutSeconds", 5);
        }
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // no-op
    }

    @Override
    public void close() {
        // no-op
    }

    @Override
    public String getId() {
        return ID;
    }
}
