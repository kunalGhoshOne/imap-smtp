const mongo = require('../database/mongo/models');
const uuid = require('uuid');
class EmailProcessor {

    async processEmail(sender,recipients, subject, rawData){   
        try {
            const EmailBodyStorage=new mongo.EmailBodyStorage();
            let emailbodyid = await EmailBodyStorage.storeEmailBody(uuid.v4(),rawData);
            let emailqueue = mongo.EmailQueue();
            emailqueue.sender = sender;
            emailqueue.recipients = recipients;
            emailqueue.subject = subject;
            emailqueue.emailbodyid = emailbodyid;
            emailqueue.save();
            console.log("Succesfully stored Email");
            return true;
        } catch (error) {
            console.log("Error data:-",error.message,JSON.stringify(error));
            return false;
        }
        
    }
    validateSender(sender){
        // return true;
        let is_email=sender.split('@')[1].includes('.');
        if(is_email){
            return true;
        }else{
            return false;
        }
    }
    validateRecipients(recipients){
        console.log("Reciepts:-",recipients);
        if(Array.isArray(recipients)){
            recipients.forEach(recipient => {
                
                console.log("recipent:-",recipient);
                let is_email=recipient.split('@')[1].includes('.');
                if(!is_email){
                    return false;
                }

            });
        }
        return true;
    }
}

module.exports = EmailProcessor;