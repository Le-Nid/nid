#!/bin/sh
set -e

# Fix ownership on bind-mounted volume (host UID may differ from appuser 1001)
# Only fix if ownership is wrong, to speed up restarts
if [ "$(stat -c '%u' /archives)" != "1001" ]; then
  chown -R appuser:appgroup /archives
else
  # Ensure new subdirectories created by host are also fixed
  find /archives ! -user appuser -exec chown appuser:appgroup {} +
fi

# Start the Node.js backend in the background (as appuser)
cd /app/backend
su-exec appuser node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to start..."
for i in $(seq 1 30); do
  if wget -qO- http://127.0.0.1:4000/api/auth/config >/dev/null 2>&1; then
    echo "Backend is ready."
    break
  fi
  sleep 1
done

# Start nginx in the foreground (as appuser)
su-exec appuser nginx -g 'daemon off;' &
NGINX_PID=$!

echo "Nid is running on port 3000"

# Trap signals and forward to both processes
trap "kill $BACKEND_PID $NGINX_PID; wait $BACKEND_PID $NGINX_PID" SIGTERM SIGINT

# Wait for either process to exit
wait -n $BACKEND_PID $NGINX_PID
EXIT_CODE=$?

# If one exits, stop the other
kill $BACKEND_PID $NGINX_PID 2>/dev/null || true
wait $BACKEND_PID $NGINX_PID 2>/dev/null || true

exit $EXIT_CODE
