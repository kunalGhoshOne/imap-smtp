const mongoose = require('mongoose');


const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/test';

mongoose.connect(MONGO_URL)
  .then(() => console.log('Connected!'))
  .catch((error)=>{
    console.log('error: ','url:- ',MONGO_URL,JSON.stringify(error));
  });

module.exports = mongoose;