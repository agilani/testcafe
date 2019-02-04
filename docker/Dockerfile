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
    dpkg

RUN pip install awscli --upgrade

RUN apk add -U curl bash ca-certificates openssl ncurses coreutils python2 make gcc g++ libgcc linux-headers grep util-linux binutils findutils
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash

RUN export NVM_DIR="$HOME/.nvm" [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [[ -r $NVM_DIR/bash_completion ]] && \. $NVM_DIR/bash_completion

RUN apk --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ upgrade && \
 apk --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ add \
 nodejs chromium firefox xwininfo xvfb dbus eudev ttf-freefont fluxbox procps
COPY testcafe-docker.sh /opt/testcafe/docker/testcafe-docker.sh

RUN nvm install 10.13.0
RUN nvm use 10.13.0

RUN npm install -g testcafe && \
 npm cache clean --force && \
 rm -rf /tmp/* && \
 chmod +x /opt/testcafe/docker/testcafe-docker.sh && \
 adduser -D user --uid 1000
 
CMD /bin/bash

USER user
EXPOSE 1337 1338
ENTRYPOINT ["/opt/testcafe/docker/testcafe-docker.sh"]
