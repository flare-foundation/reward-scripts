export function readJSON<T>(filename: string) {
   const fs = require('fs');

   let data = fs.readFileSync(filename).toString();

   // remove all comments
   //data = data.replace(/((["'])(?:\\[\s\S]|.)*?\2|(?:[^\w\s]|^)\s*\/(?![*\/])(?:\\.|\[(?:\\.|.)\]|.)*?\/(?=[gmiy]{0,4}\s*(?![*\/])(?:\W|$)))|\/\/.*?$|\/\*[\s\S]*?\*\//gm, '$1');
   data = data.replace(/((["'])(?:\\[\s\S]|.)*?\2|\/(?![*\/])(?:\\.|\[(?:\\.|.)\]|.)*?\/)|\/\/.*?$|\/\*[\s\S]*?\*\//gm, '$1');

   // remove trailing commas
   data = data.replace(/\,(?!\s*?[\{\[\"\'\w])/g, '');

   //console.log( data );

   const res = JSON.parse(data) as T;

   return res;
}
