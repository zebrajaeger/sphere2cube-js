# @zebrajaeger/createpano

[![NPM Version][npm-image]][npm-url]
[![Install Size](https://packagephobia.now.sh/badge?p=@zebrajaeger/createpano)](https://packagephobia.now.sh/result?p=@zebrajaeger/createpano)

Converts  
- full spheric panorama image to viewer (equirectangular)
- 360° panorama image to viewer (y to small for equirectangular)
- partial panorama image ti viewer (TODO)

Reads 
- PSD and PSB with RAW or RLE Encoding
- jpg
- png (TODO)

Writes
- preview (cubic)
- preview (downscaled)
- tiles (pyramide levels)
- html (pannellum implementation)
- all above as zip file 

Many Thanks to
- https://stackoverflow.com/questions/29678510/convert-21-equirectangular-panorama-to-cube-map
- https://stackoverflow.com/questions/1726630/formatting-a-number-with-exactly-two-decimals-in-javascript
