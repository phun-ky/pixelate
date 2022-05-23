#!/usr/bin/env node
/* eslint no-console:0 no-useless-escape:0*/
'use strict';

import glob from 'glob';
import fs from 'fs';
import path, { dirname } from 'path';
import ora from 'ora';
import { spawn } from 'child_process';
import winston from 'winston';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = winston.loggers.get('default');
const spinner = ora({
  prefixText: 'pixelate'
});
/**
#262d35
#009dff
#2d445b
#ffbe45

 */

// convert pixelate-test.jpeg -colors 8 -format "%c" histogram:info

const _get_histogram = (file, colors = 8, format = '%c') => {};
const _run = async (exec, args) => {
  spinner.stop();
  logger.debug(`${exec} ${args.join(' ')}`);
  spinner.start();

  const _child = spawn(exec, args);

  let _data = '';

  for await (const chunk of _child.stdout) {
    _data += chunk;
  }

  let _error = '';

  for await (const chunk of _child.stderr) {
    spinner.stop();
    logger.error(chunk);
    spinner.start();
    _error += chunk;
  }

  const _exit_code = await new Promise((resolve, reject) => {
    _child.on('close', resolve);
  });

  if (_exit_code) {
    throw new Error(`subprocess error exit ${_exit_code}, ${_error}`);
  }

  return _data;
};
const _test_image_1 = 'img/20180715_131739.jpg';
const _test_image_2 = 'img/20180728_150439.jpg';

// '#fff000'.match(/^#[a-z0-9]{6}$/i)

export const colorsBin = async (pathToImages) => {
  spinner.start('Fetching colors from images in <path>...');

  const _files = glob.sync(path.join(__dirname, pathToImages, '*.jpg'));

  spinner.stop();
  logger.info(_files);
};

export const pixelate = async (img) => {
  spinner.start('Pixelating original image...');

  const _exec = 'convert';
  const _args = ['-scale', '1%', '-scale', '100%', img, 'pixelated.jpg'];

  try {
    const _raw_result = await _run(_exec, _args);

    spinner.stop();
    logger.debug(_raw_result);
    spinner.start();
  } catch (e) {
    spinner.fail(e);
    logger.error(e);
  }
  spinner.stop();
};

export const colors = async (img) => {
  spinner.start('Fetching colors from image...');
  await pixelate(img);

  const _exec = 'convert';
  const _args = [
    'pixelated.jpg',
    '-colors',
    '8',
    '-format',
    '"%c"',
    'histogram:info:'
  ];

  try {
    const _raw_result = await _run(_exec, _args);

    spinner.stop();
    logger.debug(_raw_result);
    spinner.start();

    const _regex = /#[a-z0-9]{6}/gim;
    const _found = _raw_result.match(_regex);

    spinner.stop();
    logger.info(`Found these colors: ${_found.join(', ')} from '${img}'`);
    spinner.start();
  } catch (e) {
    spinner.fail(e);
    logger.error(e);
  }
  spinner.stop();
};
