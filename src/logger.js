const { createLogger, format, transports } = require('winston')
const winston = require('winston')

winston.configure({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mantle' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `quick-start-combined.log`.
    // - Write all logs error (and below) to `quick-start-error.log`.
    //
    new winston.transports.File({
      filename: 'mantle-error.log',
      level: 'error',
    }),
    new winston.transports.File({ filename: 'mantle.log' }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'mantle-exceptions.log' }),
  ],
})

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple winston.format.
//
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  winston.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  )
}
