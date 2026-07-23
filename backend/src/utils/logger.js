'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

function getLogger() {
  const cfg = config.get();
  const logsDir = cfg.logs.dir;

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  return createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.printf(({ timestamp, level, message, stack }) => {
        return stack
          ? `[${timestamp}] [${level.toUpperCase()}] ${message}\n${stack}`
          : `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      })
    ),
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.printf(({ timestamp, level, message }) =>
            `[${timestamp}] ${level}: ${message}`
          )
        )
      }),
      new transports.File({
        filename: path.join(logsDir, 'record.log'),
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true
      }),
      new transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true
      })
    ]
  });
}

module.exports = getLogger();
