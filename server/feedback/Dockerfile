FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server.mjs validation.mjs ./
USER node
ENV HOST=127.0.0.1 PORT=8771 FEEDBACK_DATA_DIR=/data
CMD ["node", "server.mjs"]
