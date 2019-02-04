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
    zip \
    dpkg \
    chromium firefox xwininfo xvfb dbus eudev ttf-freefont fluxbox procps \
    nodejs npm

RUN pip install awscli --upgrade

COPY testcafe-docker.sh /opt/testcafe/docker/testcafe-docker.sh

RUN npm install -g n

RUN n 10.13.0

RUN npm install -g testcafe && \
 npm cache clean --force && \
 rm -rf /tmp/* && \
 chmod +x /opt/testcafe/docker/testcafe-docker.sh && \
 adduser -D user --uid 1000
 
CMD /bin/bash

USER user
EXPOSE 1337 1338
ENTRYPOINT ["/opt/testcafe/docker/testcafe-docker.sh"]
