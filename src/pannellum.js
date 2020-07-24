module.exports = {
    createHtml: createHtml
}

function createHtml(data) {
    return `
<!DOCTYPE HTML>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.htmlTitle}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
        <style>
        html, body {
            margin:0px;
            height:100%;
            background: black;
        }
        .panorama {
            width: calc(100vw - 1px);
            height: calc(100vh - 1px);
        }
        </style>
    </head>
    <body>
    
    <div id="panorama" class="panorma"/>
    
    <script>
        function checkSensor() {
            return new Promise(resolve => {
                const sensor = new AbsoluteOrientationSensor();
                if (sensor) {
                    sensor.onreading = () => {
                        console.log('onReading');
                        sensor.stop();
                        resolve(true);
                    }
                    sensor.onerror = (event) => {
                        if (event.error.name === 'NotReadableError') {
                            console.log("Sensor is not available.");
                        }
                        sensor.stop();
                        resolve(false);
                    }
                    sensor.start();
                } else {
                    resolve(false);
                }
            })
        }

        (async () => {
            const av = await checkSensor();
            const cfg = {
                "type": "multires",
                "multiRes": {
                    "basePath": ".",
                    "path": "/%l/%s%y_%x",
                    "extension": "png",
                    "tileResolution": ${data.tileSize},
                    "maxLevel": ${data.levels.levelCount},
                    "cubeResolution": ${data.targetImageSize},
                }, 
                "preview": "${data.previewPath}",
                "autoLoad": ${data.autoLoad},
                "minYaw": ${data.area.x.min},
                "maxYaw": ${data.area.x.max},
                "minPitch": ${data.area.y.min},
                "maxPitch": ${data.area.y.max}
            }
            cfg['orientationOnByDefault'] = av;
            if (!av) {
                cfg['autoRotate'] = 2;
            }
            if(console){
                console.log(cfg);
            }
            pannellum.viewer('panorama', cfg);
        })();
    </script>
    </body>
</html>
`;
}

