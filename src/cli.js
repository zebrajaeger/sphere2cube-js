#!/usr/bin/env node

const converter = require('./converter');
const {program} = require('commander');
const fs = require('fs');
const path = require('path');

// find and parse package.json
const p = process.argv[1]
const pjp = path.resolve(p, '../..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(pjp, 'utf-8'))

// cli
program.version(packageJson.version)
program
    .requiredOption('-i, --input <path>', 'Input image (mandatory)')
    .option('-pa, --panoAngle <degree>', 'Angle of pano', '360')
    .option('-py, --panoYOffset <degree>', 'Y-Offset in degree [-90.0...90.0]', '0')

    .option('-o, --output <path>', 'Output folder', '.')
    .option('-te, --targetSize <pixel>', 'Image edge length of a face @ max resolution (default: inputImage.x / 4)', undefined)

    .option('-ti, --tilesIgnore', 'Dont render tiles', 'false')
    .option('-ts, --tileSize <pixel>', 'Tile size', '512')
    .option('-tq, --tileQuality <percent>', 'Jpg Image quality of tiles in percent', '85')

    .option('-pi, --previewIgnore', 'Dont render preview', 'false')
    .option('-pp, --previewPath <path>', 'path and name of preiew image', './preview.png')
    .option('-pw, --previewWidth <pixel>', 'Preview width', '1000')
    .option('-pw, --previewQuality <percent>', 'Preview quality in percent', '85')

    .option('-hi, --htmlIgnore', 'Don\'t render html', 'false')
    .option('-ht, --htmlTitle <name>', 'Head-Title-Tag (default: inputImage)', undefined)

    .option('-zi, --zipIgnore', 'Don\'t zip', 'false')
    .option('-zp, --zipPath <path>', 'Path for Zip File', 'pano.zip')

    .option('-v, --verbose', 'verbose', 'false')

    .parse(process.argv);


let title = program.input;
if (program.htmlTitle && program.htmlTitle.length !== 0) {
    title = program.htmlTitle;
}

const cfg = {
    targetImgSize: program.targetSize,
    panoAngle: parseFloat(program.panoAngle),
    panoYOffset: parseFloat(program.panoYOffset),

    backgroundColor: {r: 0, g: 0, b: 0, a: 0},
    tilesIgnore: Boolean(program.tilesIgnore),
    tileSize: parseInt(program.tileSize, 10),
    tileQuality: parseInt(program.tileQuality, 10),

    previewIgnore: Boolean(program.previewIgnore),
    previewWidth: parseInt(program.previewWidth, 10),
    previewPath: program.previewPath,
    previewQuality: parseInt(program.previewQuality, 10),

    htmlIgnore: Boolean(program.htmlIgnore),
    htmlTitle: title,

    zipPath: program.zipPath,
    zipIgnore: Boolean(program.zipIgnore),

    verbose: Boolean(program.verbose)
};

if (cfg.verbose) {
    console.log({input: program.input, output: program.output})
    console.log(cfg)
}

converter.renderPano(program.input, program.output, cfg).then();
