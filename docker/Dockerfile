FROM alpine:edge

RUN apk --no-cache update && \
    apk --no-cache add \
    bash \
    curl \
    findutils \
    g++ \
    gawk \
    git \
    grep \
    make \
    python \
    py-pip \
    sed \
    sudo \
    unzip \
    zip

RUN pip install awscli --upgrade

RUN apk --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ upgrade && \
 apk --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ add \
 nodejs nodejs-npm chromium firefox xwininfo xvfb dbus eudev ttf-freefont fluxbox procps

COPY testcafe-docker.sh /opt/testcafe/docker/testcafe-docker.sh

RUN npm install -g testcafe n && \
 npm cache clean --force && \
 rm -rf /tmp/* && \
 chmod +x /opt/testcafe/docker/testcafe-docker.sh && \
 adduser -D user --uid 1000

RUN n 10.13.0

CMD /bin/bash

USER user
EXPOSE 1337 1338
ENTRYPOINT ["/opt/testcafe/docker/testcafe-docker.sh"]
