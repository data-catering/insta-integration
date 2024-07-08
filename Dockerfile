ARG NODE_VERSION=20.6.0

FROM node:${NODE_VERSION}-alpine

# Use production node environment by default.
ENV NODE_ENV production
ENV CONFIGURATION_FILE insta-integration.yaml
ENV INSTA_INFRA_FOLDER integration-test/insta-infra
ENV BASE_FOLDER /tmp/insta-integration
ENV DOCKER_VERSION 27.0.3
WORKDIR /usr/src/app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
    && apk --no-cache add docker-cli

# Run the application as a non-root user.
USER node

# Copy the rest of the source files into the image.
COPY . .

# Run the application.
CMD node -e 'require("./src/index").init()'
