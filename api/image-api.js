const http = require('http');
const fs = require('fs');
const express = require('express');
const fileUpload = require("express-fileupload");
const ImageDataURI = require('image-data-uri');
const cron = require('node-cron');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const Buffer = require('buffer').Buffer;
var bodyParser = require('body-parser')
var cors = require('cors');
const {
    fabric
} = require('fabric');
const {
    rateLimit
} = require('express-rate-limit');
const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));


app.use(fileUpload());
app.use(cors({
  origin: '*',
'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use((req, res, next) => {
    // Log an info message for each incoming request
    logger.info(`Received a ${req.method} request for ${req.url}`);
    next();
});


const winston = require("winston");
const logger = winston.createLogger({
    // Log only if level is less than (meaning more severe) or equal to
    // this
    level: "info",
    // Use timestamp and printf to create a standard log format
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
            (info) => `${info.timestamp} ${info.level}: ${info.message}`
        )
    ),
    // Log to the console and a file
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: "logs/app.log"
        }),
    ],
});

function sendImgBack(req, res, canvas)  {

        outType = req.body.outType;
	if(!outType) {
		outType = 'image';
	}
        console.log("I am sending output as::" + outType);
	var imageData;
        switch (outType) {
            case 'html':
            case 'Download':
                res.writeHead(200, '', {
                    'Content-Type': 'text/html'
                });
                /* XXX works with fabric canvas */
                imageData = canvas.toDataURL();
                res.write(`<img src="${imageData}" />`);
                res.end();
                break;
            case 'image':
                res.writeHead(
                    200, {
                        "Content-Type": "image/png",
                    }
                );
		dataURI = canvas.toDataURL({format: 'png'});
		var out = ImageDataURI.decode(dataURI);
		var rawPNG = Buffer.from(out.dataBuffer);
		res.write(rawPNG);
                res.end();

                break;
            case 'JSON':
                var out = canvas.toJSON();
                var blob = new Blob([out], {
                    type: 'application/json'
                });
                blob.arrayBuffer().then((buf) => {
                    res.send(Buffer.from(buf))
                });
                break;
            case 'Blob':
                var data = JSON.stringify(canvas.toJSON()),
                    blob = new Blob([data], {
                        type: "octet/stream"
                    });
                res.type(blob.type);
                blob.arrayBuffer().then((buf) => {
                    res.send(Buffer.from(buf))
                });
                break;
            case 'Base64':
                const base64Canvas = canvas.toDataURL("image/jpeg").split(';base64,')[1];
                res.write(base64Canvas);
                res.end();
                break;

            default:
                /* No outType sent, defaulting to HTML */
                res.writeHead(200, '', {
                    'Content-Type': 'text/html'
                });
		dataURI = canvas.toDataURL({format: 'png'});
		var out = ImageDataURI.decode(dataURI);
		var rawPNG = Buffer.from(out.dataBuffer);
		res.write(rawPNG);
                res.end();
        }
 }

function saveUpload(req, res)  {
        var upfile;
        upfile = req.files.upfile,
            updest = __dirname + "/uploads/" + upfile.name;

        upfile.mv(updest, err => {
            if (err) {
                return res.status(500).send(err);
            }
        });
}

function validateInput(req, res, )  {
    url = req.body.imageURL;
    if (!url && !req.files.upfile) {
        return printErrResp(req, res, "URL  or image is missing.");
    }
 	if (req.files) {
            saveUpload(req, res);
            upfile = req.files.upfile,
                updest = 'file://' + __dirname + "/uploads/" + upfile.name;
        } else {
            updest = req.body.imageURL;
        }
	return updest;

}



/* XXX Image Echo endpoint */
app.post('/v1/internal/ImageEcho', (req, res) => {
	updest = validateInput(req, res);
    /* Image echo test endpoint */
        console.log("Input file ::" + updest);
        fabric.Image.fromURL(updest, function(img) {
var canvas = new fabric.StaticCanvas(null, { width: img.width, 
		height: img.height });
                canvas.add(img)
                sendImgBack(req, res, canvas);
	});
});

async function removebg(image, cb) {
	image = image.replace('file://', '');
	console.log("Removing bg of " + image);
  const { stdout, stderr } = await exec('rembg/bin/rembg i ' + image +
'  output.png');
	cb('file:///' + __dirname + '/output.png');
}


/* XXX Remove background endpoint */
app.post('/v1/transform/RemoveBG', function(req, res) {
    if(res.headersSent) return;

	updest = validateInput(req, res);
        console.log("Input file ::" + updest);
    	console.log("Removing background");
    	removebg(updest, function(url) {
    	console.log("Removed background. Now sending");
    fabric.Image.fromURL(url, function(img) {
		console.log(img);
	var canvas = new fabric.StaticCanvas(null, { width: img.width, 
		height: img.height });
                canvas.add(img)
                sendImgBack(req, res, canvas);
    });
    });
});


/* XXX Express code */
const server = http.createServer(app);
const port = 3000;
server.listen(port);
console.log('Server listening on port ' + port);
