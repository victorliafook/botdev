/*-----------------------------------------------------------------------------
A simple Language Understanding (LUIS) bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");

//turn debug ON/OFF
var debug = true;

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

//some default greetings answers
var greetings = [
    "Hello, let's see if I can help you",
    "Hi there! let's see if I can help you",
    "Hi, let's see if I can help you"
];

// Create your bot with a function to receive messages from the user
// This default message handler is invoked if the user's utterance doesn't
// match any intents handled by other dialogs.
var bot = new builder.UniversalBot(connector, function (session, args) {
   //session.send('You reached the default message handler. You said \'%s\'.', session.message.text);
   session.beginDialog('NoneDialog');
});

bot.set('storage', tableStorage);
// Do not persist userData
bot.set(`persistUserData`, false);
// Do not persist conversationData
//bot.set(`persistConversationData`, false);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;

// Create a recognizer that gets intents from LUIS, and add it to the bot
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
//console.log(recognizer);
bot.recognizer(recognizer);

bot.dialog('GreetingDialog', 
    (session, args, next) => {
        console.log('greet', session.conversationData.greetDone);
        session.sendTyping();
        if (!session.conversationData.greetDone) {
            session.conversationData.greetDone = true;
            if (session.userData.noStartGreet) {
                builder.Prompts.choice(session, "These are things I can help you with:", "Book a Webinar|My Assessments|Message my trainer", { listStyle: builder.ListStyle.button });    
            } else {
                builder.Prompts.choice(session, "Hi there Sara! I am Frankie your supportbot. What can I help you with today?", "Book a Webinar|My Assessments|Message my trainer", { listStyle: builder.ListStyle.button });
            }                   
        } else {
            var msg = greetings[Math.floor(Math.random() * greetings.length)];
            session.send(msg);
        }
        session.endDialog();       
    }
).triggerAction({
    matches: 'Greet',
    //overwrite default dialog behavior, dont clear the stack. i.e. return to what was being done afterwards
    onSelectAction: (session, args, next) => {
        session.beginDialog(args.action, args);
    }
});

bot.dialog('FindAssessmentDialog',
    (session) => {
        debugTalk(session, 'You reached the FindAssessmentDialog intent. You said \'%s\'.', session.message.text);
        //session.endDialog();
    }
).triggerAction({
    matches: 'FindAssessment'
});

bot.dialog('SubmitAssessmentDialog',
    (session) => {
        session.send();
        debugTalk(session, 'You reached the SubmitAssessmentDialog intent. You said \'%s\'.', session.message.text);
        //session.endDialog();
    }
).triggerAction({
    matches: 'SubmitAssessment'
});

// ##### Webinar-related dialogs #####
bot.dialog('InfoWebinarDialog',[
    (session, args, next) => {
        //webinar info link
        session.send("You can find all the information you need about webinars right here.");
        session.send("https://os.opencolleges.edu.au/page#/support-article/what-are-online-tutorials-and-how-can-they-help-you");
        next();
    },
    (session, args, next) => {
        session.beginDialog('EndingHelpDialog');
    }
]);

bot.dialog('BookWebinarDialog',[
    (session, args, next) => {
        //show available webinars
        builder.Prompts.text(session, "Select the right webinar for you:");
        var cards = getCardsAttachments();
        var reply = new builder.Message(session)
            .attachmentLayout(builder.AttachmentLayout.carousel)
            .attachments(cards);
        session.send(reply);
    },
    (session, args, next) => {
        //show available hours
        
        builder.Prompts.text(session, "Sure thing.");
        var msg = new builder.Message(session)
            .text("Now lets pick a day and time that works for you.")
            .suggestedActions(
                builder.SuggestedActions.create(
                    session, [
                        builder.CardAction.imBack(session, "Tuesday 3rd April - 3:15pm", "Tuesday 3rd April - 3:15pm"),
                        builder.CardAction.imBack(session, "Wednesday 4th April - 7:15pm", "Wednesday 4th April - 7:15pm"),
                        builder.CardAction.imBack(session, "Friday 6th April - 12:15pm", "Friday 6th April - 12:15pm"),
                        builder.CardAction.imBack(session, "Later date", "Later date")
                    ]
                ));
        session.send(msg);
    },
    (session, args, next) => {
        //confirmation
        builder.Prompts.text(session, "You have requested to attend a Referencing/Writing Webinar on Wednesday 4th April at 7:15pm");
        var msg = new builder.Message(session)
            .text("Would you like me to book this for you?")
            .suggestedActions(
                builder.SuggestedActions.create(
                    session, [
                        builder.CardAction.imBack(session, "Yes please", "Yes please"),
                        builder.CardAction.imBack(session, "No thank you", "No thank you"),
                        builder.CardAction.imBack(session, "Take me back to the start", "Take me back to the start")
                    ]
                ));
        session.send(msg);
    },
    (session, args, next) => {
        debugTalk(session, 'received this as answer: \'%s\'', session.message.text);
        session.send("Done, you will receive an email with all the details. I hope you enjoy this session.");
        next();
    },
    (session, args, next) => {
        session.beginDialog('EndingHelpDialog');
    }
]).triggerAction({
    onInterrupted: (session, dialogId, args, next) => {
        //TODO: check if its being interrupted by itself
        console.log('interruptor: ', args.action);
        session.send('Looks like you want to talk about \'%s\' now.', args.intent.intent);
        next();
    },
    confirmPrompt: "Do you want to cancel the current task and talk about it?"
});

bot.dialog('WebinarTalkDialog', [
    // Step 1 - check what to talk about
    /**
     * Yes, Book a Webinar
     * More info   
     * back
     */
    (session, args, next) => {
        //builder.Prompts.choice(session, "Good choice. I can book this for you today or direct you to more information.", "Yes please book|I would like more info|Go back", { listStyle: builder.ListStyle.button });
        //console.log('cycling session', session);
        //session.sendTyping();
        if (!session.dialogData.choicesSeen) {
            session.send("So let's talk about webinars. Would you like me to book this for you today?");
            session.dialogData.choicesSeen = true;
            //TODO: store the caller in case to go back
        } else {
            //session.send("Sorry, do you want me to book it?");
            askLuis(
            session.message.text, 
            function(err, intents, entities) {
                if (err) {
                    console.log('error: ', err);
                    return;
                }
                console.log('intents', intents);
                console.log('entities', entities);
            }).then(
                function(data){
                    console.log('Louis\'s Promise resolved!');
                    console.log(data);
                    var chosenIntent = data.intents[0].intent;
                    if (chosenIntent == 'AffirmativeAnswer' || chosenIntent == 'BookWebinar') {
                        session.dialogData.choice = 'bookWebinar';
                        next();
                    } else if (chosenIntent == 'NegativeAnswer') {
                        session.dialogData.choice = 'infoWebinar';
                        next();
                    } else if (chosenIntent == 'AskingInfo') {
                        session.dialogData.choice = 'infoWebinar';
                        next();
                    } else if (chosenIntent == 'None') {
                        session.beginDialog('NoneDialog');
                    } else {
                        session.send("Im afraid I didnt get what you mean...");
                    }
                    
                },
                function(err) {
                     session.send("ERRO CRITICO");
                }
            );
        }
        
        /*var msg = new builder.Message(session)
        	.text("Good choice. I can book this for you today or direct you to more information.")
        	.suggestedActions(
        		builder.SuggestedActions.create(
        			session, [
        				builder.CardAction.imBack(session, "Yes please book", "Yes please book"),
        				builder.CardAction.imBack(session, "I would like more info", "I would like more info"),
        				builder.CardAction.imBack(session, "Go back", "Go back")
        			]
        		));
        session.send(msg);
        */
 
        //console.log('input intent', (args) ? args.intent : 'no args');
        console.log('user input', session.message.text);

    },
    (session, args, next) => {
        //debugTalk(session, 'This was a valid answer. You said \'%s\'.', session.message.text);
        debugTalk(session, 'received this as answer: \'%s\'', session.message.text);
        console.log('received this in the message', args.response);
        if (session.dialogData.choice == 'bookWebinar') {
            session.send("Great. Lets book it.");
            session.beginDialog('BookWebinarDialog');
        }
        if (session.dialogData.choice == 'infoWebinar') {
            session.send("Ok. Let me try to help you.");
            session.beginDialog('InfoWebinarDialog');
        }
        
    }
]).triggerAction({
    matches: 'BookWebinar',
    //confirmPrompt: "Are you sure?"
    onInterrupted: (session, dialogId, args, next) => {
        //TODO: check if its being interrupted by itself
        console.log('interrupting msg: ', session.message.text);
        console.log('interruptor: ', args.action);
        //console.log('this func: ', next);
        //TODO: try using the {response: 'blabla'}
        if (args.action == '*:WebinarTalkDialog'){
            //TODO: check wat to return here
            console.log('go back');
            return null;
        }
        session.send('Looks like you want to talk about \'%s\' now.', args.intent.intent);
        next();
    },
    confirmPrompt: "Do you want to cancel the current task and talk about it?"
});

bot.dialog('NoneDialog', [
    (session, args, next) => {
        builder.Prompts.choice(session, "As I am still learning, I won't be able to help you with this question today!\nBut let me point you in the right direction.", "Go to our support page|Send enquiry to support team|Connect to a live agent", { listStyle: builder.ListStyle.button });
    },
    (session, args, next) => {
        builder.Prompts.confirm(session, "Sure thing! The team will contact you within 48 hours. Would you like me to send this enquiry now?");
    },
    (session, args, next) => {
        session.send("Done! Your case number is 004563892");
        next();
    },
    (session, args, next) => {
        session.beginDialog('EndingHelpDialog');
    }
]).triggerAction({
    //apparently none intent has a lower priority. check it later
    matches: 'None'
});

bot.dialog('HelpDialog', [
    (session, args, next) => {
        
        //ask for help
        //builder.Prompts.confirm(session, "Can I help you with anything else today?");
        if (!session.dialogData.askHelpSeen) {
            session.send('No problem. How can I help you?');
            session.dialogData.askHelpSeen = true;
        } else {
            askLuis(
            session.message.text, 
            function(err, intents, entities) {
                if (err) {
                    console.log('error: ', err);
                    return;
                }
                console.log('intents', intents);
                console.log('entities', entities);
            }).then(function(data) {
                console.log('ret:', data);
                if( data.intents[0].intent == 'None') {
                    session.beginDialog('NoneDialog');
                } else if( data.intents[0].intent == 'AffirmativeAnswer') {
                    session.endConversation();
                    console.log('restarting conversation...');
                    session.userData.noStartGreet = true;
                    session.beginDialog('GreetingDialog');
                } else {
                    next();
                }
            });
        }       
        
    },
    (session, args, next) => {
        //goodbye
        session.send("Enjoy your day Sara. See you again soon.");
        next();
    },
    (session, args, next) => {
        session.endConversation();
    }
]).triggerAction({
    matches: 'ContactSupport'
});

bot.dialog('EndingHelpDialog', [
    (session, args, next) => {
        
        //ask for help
        //builder.Prompts.confirm(session, "Can I help you with anything else today?");
        if (!session.dialogData.askHelpSeen) {
            session.send('Can I help you with anything else today?');
            session.dialogData.askHelpSeen = true;
        } else {
            askLuis(
            session.message.text, 
            function(err, intents, entities) {
                if (err) {
                    console.log('error: ', err);
                    return;
                }
                console.log('intents', intents);
                console.log('entities', entities);
            }).then(function(data) {
                console.log('ret:', data);
                if( data.intents[0].intent == 'None') {
                    session.beginDialog('NoneDialog');
                } else if( data.intents[0].intent == 'AffirmativeAnswer') {
                    session.endConversation();
                    console.log('restarting conversation...');
                    session.userData.noStartGreet = true;
                    session.beginDialog('GreetingDialog');
                } else {
                    next();
                }
            });
        }       
        
    },
    (session, args, next) => {
        //goodbye
        session.send("Enjoy your day Sara. See you again soon.");
        next();
    },
    (session, args, next) => {
        session.endConversation();
    }
]);

bot.dialog('TrainerDialog', [
    (session, args, next) => {
        //ask for help
        builder.Prompts.confirm(session, "TODO: Something regarding trainers.");
    },
    (session, args, next) => {
        //goodbye
        builder.Prompts.text(session, "Enjoy your day. See you again soon.");
    },
    (session, args, next) => {
        session.endConversation();
    }
]).triggerAction({
    matches: 'MessageTrainer'
});
// ##### General purpose dialogs #####

bot.dialog('AffirmativeAnswerDialog', [
    (session, args, next) => {
        session.endDialogWithResult({response:true});
    }
]).triggerAction({
    matches: 'AffirmativeAnswer',
    onSelectAction: (session, args, next) => {
        session.beginDialog(args.action, args);
    }
});

bot.dialog('NegativeAnswerDialog', [
    (session, args, next) => {
        session.endDialogWithResult({response:false});
    }
]).triggerAction({
    matches: 'NegativeAnswer',
    onSelectAction: (session, args, next) => {
        session.beginDialog(args.action, args);
    }
});

bot.dialog('EndConversationDialog', [
    (session, args, next) => {
        session.send(session, "Nice speaking to you today. See you again soon!");
        session.endConversation();
    }
]).triggerAction({
    matches: 'EndConversation'
});

// ##### Assessments-related dialogs #####
//TODO



// ##### General Purpose Functions #####
function askLuis(msg, callback, entities) {
    return new Promise(function(success, fail){
        try {
            builder.LuisRecognizer.recognize(
                msg, 
                LuisModelUrl, 
                function(err, intents, entities) {
                    if (err) {
                        console.log('error: ', err);
                        return;
                    }
                    success({intents: intents, entities: entities});
                });
        } catch (exception) {
            console.log('Error on Luis call: ', exception);
            fail();
        }
        
    });
}

function debugTalk(session, msg, arg) {
    if (!debug) {
        return;
    }
    session.send(msg, arg);
}

function getCardsAttachments(session) {
    return [
        new builder.HeroCard(session)
            .title('Academic Referencing')
            .subtitle('45 Minutes')
            .text('Referencing/writing: an interactive session designed to teach you how to reference your course materials and other sources in your assessments.')
            .images([
               builder.CardImage.create(session, 'https://s3.envato.com/files/111173317/Preview%20Notebook%20vs%20Pencil.JPG')
            ])
            .buttons([
               builder.CardAction.imBack(session, 'Academic Referencing', 'Choose a Time')
            ]),
        new builder.HeroCard(session)
            .title('Live Orientation')
            .subtitle('45 Minutes')
            .text('Live orientation: this is the first step in getting started with your course and recommended for all new students.')
            .images([
               builder.CardImage.create(session, 'http://au.elevateeducation.com/cms_uploads/images/134_au_attention-study-and-the-facebook-effect.jpg')
            ])
            .buttons([
               builder.CardAction.imBack(session, 'Live Orientation', 'Choose a Time')
            ]),
        new builder.HeroCard(session)
            .title('Time Management')
            .subtitle('45 minutes')
            .text('Time management and study tips: this is an interactive session designed to help you learn how to set up a study plan that works for you.')
            .images([
               builder.CardImage.create(session, 'http://www.rachelobeauty.com/wp-content/uploads/2013/11/AABusyMom.jpg')
            ])
            .buttons([
               builder.CardAction.imBack(session, 'Time Management', 'Choose a Time')
            ])
    ];
};



