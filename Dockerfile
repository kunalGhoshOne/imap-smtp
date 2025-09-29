FROM node:20

WORKDIR /usr/src/app

COPY . .

RUN chmod +x /usr/src/app/run.sh

EXPOSE 25 143

ENTRYPOINT ["/usr/src/app/run.sh"]