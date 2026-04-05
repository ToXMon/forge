FROM nginx:1.25-alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy PWA static files
COPY index.html /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

# Ensure WASM MIME type is served
RUN mkdir -p /usr/share/nginx/html/wasm

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
