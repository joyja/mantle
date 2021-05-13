#!/bin/bash

# any future command that fails will exit the script
set -e

# Run the pm2 deploy script
cd /home/ubuntu/mantle
pm2 deploy production ecosystem.config.js update
