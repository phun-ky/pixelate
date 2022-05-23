#!/usr/bin/env node
/* eslint no-console:0 no-useless-escape:0*/
'use strict';

import meow from 'meow';
import { colors, colorsBin } from './colors.mjs';
import winston, { format, transports } from 'winston';

const { combine, timestamp, label, colorize, printf } = format;
const _transports = [
  new transports.File({ filename: 'error.log', level: 'error' }),
  new transports.File({ filename: 'combined.log' })
];

winston.loggers.add('default', {
  level: 'info',
  format: winston.format.json()
});

const _pixelate_log_format = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

if (process.env.NODE_ENV !== 'production') {
  _transports.push(
    new transports.Console({
      format: combine(
        label({ label: 'pixelate' }),
        timestamp(),
        _pixelate_log_format,
        colorize({
          all: true
        })
      )
    })
  );
}

const cli = meow(
  `
	Usage
	  $ pixelate <options>

	Options
	  --colors <image>, -c <image> Get colors from <image>
	  --bin <path>, -b <path> Get the dominent color from each image in <path>
	  --loglevel=<loglevel>, -l <loglevel> Set log level to <loglevel>

	Examples
	  $ pixelate --colors 20180711_185145.jpg
	  <result>
	  $ pixelate --colors-bin img/
	  <result>
`,
  {
    importMeta: import.meta,
    flags: {
      colors: {
        type: 'boolean',
        alias: 'c'
      },
      bin: {
        type: 'string',
        alias: 'b'
      }
    }
  }
);
const logger = winston.loggers.get('default');

logger.configure({
  level: cli.flags.l || 'info',
  transports: _transports
});

logger.silly(JSON.stringify(cli, null, 2));
logger.debug(`Input used: ${JSON.stringify(cli.input, null, 2)}`);
logger.debug(`Options used: ${JSON.stringify(cli.flags, null, 2)}`);

if (cli.flags.colors && cli.input.length !== 0) {
  colors(cli.input[0]);
} else if (cli.flags.bin !== '') {
  colorsBin(cli.flags.bin);
} else {
  logger.info('No input or valid command found');
}
