const mongoose = require("mongoose");

const databaseConnection = () => {
  mongoose 
    .connect(process.env.DB_URL, {  
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // useCreateIndex: true,
    })
    .then((data) => {
      console.log(`mongoose connected with server ${data.connection.host} `); 
    });
};

module.exports = databaseConnection;
