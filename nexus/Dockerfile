FROM sonatype/nexus3:latest
USER root
RUN mkdir -p /opt/sonatype/nexus/deploy
ADD https://github.com/flytreeleft/nexus3-keycloak-plugin/releases/download/v0.5.0/nexus3-keycloak-plugin-0.5.0-bundle.kar \
    /opt/sonatype/nexus/deploy/nexus3-keycloak-plugin.kar
COPY keycloak.json /opt/sonatype/nexus/etc/keycloak.json
RUN chown -R nexus:nexus \
    /opt/sonatype/nexus/deploy/nexus3-keycloak-plugin.kar \
    /opt/sonatype/nexus/etc/keycloak.json
USER nexus
