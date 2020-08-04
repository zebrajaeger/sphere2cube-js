#!/usr/bin/env node

const converter = require('./converter');
const {program} = require('commander');
const fs = require('fs');
const path = require('path');

// find and parse package.json
const pjp = path.resolve(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(pjp, 'utf-8'))

// cli
program.version(packageJson.version)
program
    // Source
    .option('-i, --source <path>', 'Source image or config', 'panoconfig.json')
    .option('-ipa, --panoAngle <degree>', 'Angle of pano', '360')
    .option('-ipy, --panoYOffset <degree>', 'Y-Offset in degree [-90.0...90.0]', '0')

    // Output
    .option('-o, --output <path>', 'Output folder', null)
    .option('-te, --targetSize <pixel>', 'Image edge length of a face @ max resolution (default: inputImage.x / 4)', null)
    .option('-fr, --facesToRender <faces>', 'Faces To render', 'flrbud')

    // Config file
    .option('-cs, --configSave', 'Save Config', 'false')

    // Tiles
    .option('-ti, --tilesIgnore', 'Dont render tiles', 'false')
    .option('-ts, --tileSize <pixel>', 'Tile size', '512')
    .option('-tq, --tileJpgQuality <percent>', 'Jpg Image quality of tiles in percent', '85')
    .option('-tp, --tilePathTemplate <template>', 'Tile path template', '{{levelCount}}/{{face}}{{y}}_{{x}}.{{fileType}}')
    .option('-tpt, --tilePathType <type>', 'Tile image type', 'jpg')

    // Cube
    .option('-c, --renderCube', 'Render cube sites in full resolution', 'true')
    .option('-cp, --cubePath <path>', 'Cube sites path', '{{face}}.jpg')
    .option('-cq, --cubeJpgQuality <percent>', 'Cube Jpg Image quality', '85')

    // Preview
    .option('-pi, --previewIgnore', 'Dont render preview', 'false')
    .option('-pcp, --previewCubePath <path>', 'Path and name of preview image', 'preview.q.jpg')
    .option('-pcq, --previewCubeJpgQuality <percent>', 'Preview quality in percent', '85')
    .option('-pfp, --previewFlatPath <path>', 'Path and name of preview image', 'preview.f.jpg')
    .option('-pfo, --previewFlatOrder <path>', 'Face order from left to right', 'bdflru')
    .option('-pfq, --previewFlatJpgQuality <percent>', 'Preview quality in percent', '85')
    .option('-psp, --previewScaledPath <path>', 'Path and name of preview image', 'preview.s.jpg')
    .option('-psf, --previewScaledFactor <path>', 'Factor for one Downscaling', Math.sqrt(2).toString())
    .option('-psq, --previewScaledJpgQuality <percent>', 'Preview quality in percent', '85')
    .option('-pw, --previewWidth <pixel>', 'Preview width', '1000')

    // Signature
    .option('-sp, --signaturImagePath <path>', 'Signature image', null)
    .option('-ss, --signaturSide <side>', 'Signature side', 'd')
    .option('-sb, --signaturBelow', 'Signature below pano image', 'false')

    // Html
    .option('-hi, --htmlIgnore', 'Don\'t render html', 'false')
    .option('-ht, --htmlTitle <name>', 'Head-Title-Tag (default: inputImage)', null)
    .option('-hpp, --htmlPannellumFile <path>', 'Path of Pannellum .html file', 'index.p.html')
    .option('-hmp, --htmlMarzipanoFile <path>', 'Path of Marzipano .html file', 'index.m.html')

    // Zip
    .option('-zi, --zipIgnore', 'Don\'t zip', 'false')
    .option('-zp, --zipPath <path>', 'Path for Zip File', null)

    // Debug
    .option('-v, --verbose', 'verbose', 'true')

    .parse(process.argv);

let cfg;
if (program.source.endsWith('.json')) {
    console.log(`Load config from File ${program.source}`)
    cfg = JSON.parse(fs.readFileSync(program.source, "utf8"));
} else {
    let htmlTitle = program.source;
    if (program.htmlTitle && program.htmlTitle.length !== 0) {
        htmlTitle = program.htmlTitle;
    }

    let zipPath = program.zipPath;
    if (!zipPath) {
        const x = path.parse(program.source);
        x.base = `${x.name}.zip`;
        zipPath = path.format(x);
    }

    let outputPath = program.output;
    if (!outputPath) {
        const x = path.parse(program.source);
        x.base = x.name;
        outputPath = path.format(x);
    }

    cfg = {
        // Source
        sourceImage: program.source,
        panoAngle: parseFloat(program.panoAngle),
        panoYOffset: parseFloat(program.panoYOffset),

        // Target
        targetFolder: outputPath,
        targetImgSize: program.targetSize,
        facesToRender: program.facesToRender,

        // Tiles
        backgroundColor: {r: 0, g: 0, b: 0, a: 0},
        tilesIgnore: Boolean(program.tilesIgnore),
        tileSize: parseInt(program.tileSize, 10),
        tileJpgQuality: parseInt(program.tileJpgQuality, 10),
        tileFileType: program.tilePathType,
        tilePathTemplate: program.tilePathTemplate,

        // Cube
        renderCube: Boolean(program.renderCube),
        cubePath: program.cubePath,
        cubeJpgQuality: program.cubeJpgQuality,

        // Preview
        previewIgnore: Boolean(program.previewIgnore),
        previewWidth: parseInt(program.previewWidth, 10),
        previewCubePath: program.previewCubePath,
        previewCubeJpgQuality: parseInt(program.previewCubeJpgQuality, 10),
        previewFlatPath: program.previewFlatPath,
        previewFlatJpgQuality: parseInt(program.previewFlatJpgQuality, 10),
        previewFlatOrder: program.previewFlatOrder,
        previewScaledPath: program.previewScaledPath,
        previewScaledFactor: parseFloat(program.previewScaledFactor),
        previewScaledJpgQuality: parseInt(program.previewScaledJpgQuality, 10),

        // Signature
        signaturImagePath: program.signaturImagePath,
        signaturSide: program.signaturSide,
        signaturBelow: Boolean(program.signaturBelow),

        // Html
        htmlIgnore: Boolean(program.htmlIgnore),
        htmlTitle,
        htmlPannellumFile: program.htmlPannellumFile,
        htmlMarzipanoFile: program.htmlMarzipanoFile,

        // Zip
        zipPath: zipPath,
        zipIgnore: Boolean(program.zipIgnore),

        // Debug
        verbose: Boolean(program.verbose)
    };

    if (program.configSave) {
        let cfgFileName = program.input || 'panoconfig.json';
        fs.writeFileSync(cfgFileName, JSON.stringify(cfg, null, 2));

        return;
    }
}

if (cfg.verbose) {
    console.log(cfg)
}

converter.renderPano(cfg).then();
