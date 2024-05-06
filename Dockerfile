FROM node:20-alpine

WORKDIR /usr/src/app

COPY . .
RUN npm install


EXPOSE 23776
CMD ["node", "."]