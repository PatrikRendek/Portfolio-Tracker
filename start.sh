#!/bin/bash

# Run migrations
echo "Running migrations..."
python manage.py migrate --noinput

# Start Gunicorn
echo "Starting Gunicorn..."
exec gunicorn stockproject.wsgi:application --bind 0.0.0.0:8000 --workers 3
