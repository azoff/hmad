FROM node:12-alpine

WORKDIR /app
ADD package.json yarn.lock /app/

RUN yarn install

ARG DEFAULT_PORT=8080
ENV PORT=$DEFAULT_PORT

ARG SECRETS_PATH=/run/secrets/hmad/secrets.json
ENV SECRETS_PATH=$SECRETS_PATH

ADD index.html /app/
ADD api /app/api
ADD assets /app/assets

CMD yarn start

EXPOSE $DEFAULT_PORT
