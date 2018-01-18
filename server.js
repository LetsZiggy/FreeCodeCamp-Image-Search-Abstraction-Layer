/**
***  RESOURCES:
***    Access data from http/https get ---> https://codeburst.io/4-ways-for-making-http-s-requests-with-node-js-c524f999942d
**/

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const mongo = require('mongodb').MongoClient;

let dbURL = `mongodb://${process.env.DBUSER}:${process.env.DBPASSWORD}@${process.env.DBURL}/freecodecamp`;
let google = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLEKEY}&cx=${process.env.GOOGLEID}&searchType=image`;
let html = null;
let css = null;

fs.readFile('./www/index.html', (err, data) => {
  if(err) { console.log(err); throw err; }
  else {
    html = data;
  }
});

fs.readFile('./www/style.css', (err, data) => {
  if(err) { console.log(err); throw err; }
  else {
    css = data;
  }
});

function getSearch(search, offset, resHttp) {
  mongo.connect(dbURL, (err, client) => {
    if(err) { console.log(err); throw err; }
    else {
      const db = client.db('freecodecamp');

      db.collection('image-search-abstraction-layer')
        .update(
          { term: search },
          { $setOnInsert: { term: search },
            $currentDate: { lastSearched: true }
          },
          { upsert: true }
      );
    }

    client.close();
  });

  let searchQuery = `&q=${search}`;
  let offsetQuery = `&start=${(Number(offset) < 2 ? null : Number(offset)) || '1'}`;

  let body = [];
  let result = [];
  https.get(`${google}${offsetQuery}${searchQuery}`, (res) => {
    res.on('data', (data) => {
      body.push(data.toString());
    });
    res.on('end', () => {
      body = JSON.parse(body.join('')).items;
      body.forEach((value, index, array) => {
        result.push({ link: value.link, context: value.image.contextLink, snippet: value.snippet, thumbnail: value.image.thumbnailLink });
      });

      resHttp.writeHead(200, { 'Content-Type': 'text/plain' });
      resHttp.end(JSON.stringify(result));
    });
  }).on('error', (err) => { console.log(err); throw err; });
}

function getRecent(resHttp) {
  mongo.connect(dbURL, (err, client) => {
    if(err) { console.log(err); throw err; }
    else {
      const db = client.db('freecodecamp');

      db.collection('image-search-abstraction-layer')
        .find()
        .sort({ lastSearched: -1 })
        .limit(10)
        .project({ _id: 0, term: 1, lastSearched: 1 })
        .toArray((err, result) => {
          if(err) { console.log(err); throw err; }
          else {
            resHttp.writeHead(200, { 'Content-Type': 'text/plain' });
            resHttp.end(JSON.stringify(result));
          }
        }
      );
    }

    client.close();
  });
}

function determineQuery(query, res) {
  let extract = query.split('/');
  
  if(extract[0] === 'recent') {
    getRecent(res);
  }
  else if(extract[0] === 'search') {
    getSearch(url.parse(extract[1], true).pathname, url.parse(extract[1], true).query.offset, res);
  }
}

let server = http.createServer((req, res) => {
  req.url = req.url.slice(1);
  if(req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
  else if(req.url.includes('style.css')) {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(css);
  }
  else if(req.url.includes('favicon.ico')) {
    res.writeHead(200, { 'Content-Type': 'image/x-icon' });
    res.end('https://cdn.glitch.com/df0642e9-fb3f-4138-a464-3fa9b1a9b420%2Fblog_logo.ico?1515316087927');
  }
  else {
    determineQuery(req.url, res);
  }
}).on('error', (err) => { console.log(err); throw err; });

let listener = server.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});