/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
var persistenceAdapter = getPersistenceAdapter();
const CTA_CONFIG = require('./cta.config.js');
const axios = require('axios');

function getPersistenceAdapter(tableName) {
    // This function is an indirect way to detect if this is part of an Alexa-Hosted skill
        const {S3PersistenceAdapter} = require('ask-sdk-s3-persistence-adapter');
        return new S3PersistenceAdapter({
            bucketName: process.env.S3_PERSISTENCE_BUCKET
        });
    }

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        // logic: launch -> please state your 3 elements
        // if saved places not available -> ask if users want to save their favorite places such as home/office/school
        // if saved places are available -> don't ask & recognize the keywords in nextMetroIntentHandler
        // further feature: user can save places into more variables other than home/office/school
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        
        const home = sessionAttributes['home'];
        
        const returningOutput = 'Welcome back! Which station or route are you going to?';
        const welcomeOutput = 'Welcome to DMV Metro, set your home metro station for quick access in the future.';
        // if users have already input in their favorite places -> ask their 3 elements
        const favoritesAvailable = home; // add favorite routes later
        if (favoritesAvailable){
            return handlerInput.responseBuilder
                .speak(returningOutput)
                .addDelegateDirective({
                    name: 'UserSetsRouteIntent',
                    confirmationStatus: 'NONE',
                    slots: {}
                })
                .getResponse();
        }
        // if users have not input in their favorite places -> ask for their favorite places
        else{
            return handlerInput.responseBuilder
                .speak(welcomeOutput)
                .addDelegateDirective({
                    name: 'UserSetsHomeIntent',
                    confirmationStatus: 'NONE',
                    slots: {}
                })
                .getResponse(); 
        }
        
    }
};

const UserSetsHomeIntentHander = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'UserSetsHomeIntent';
    },
    handle(handlerInput){
        const {attributesManager, requestEnvelope} = handlerInput;
        // the attributes manager allows us to access session attributes
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const {intent} = requestEnvelope.request;
        
        const getCanonicalSlot = (slot) => {
            if (slot.resolutions && slot.resolutions.resolutionsPerAuthority.length) {
                for (let resolution of slot.resolutions.resolutionsPerAuthority) {
                    if (resolution.status && resolution.status.code === 'ER_SUCCESS_MATCH') {
                        return resolution.values[0].value.name;
                    }
                }
            }
        }
       
        const home = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'home'));
        
        
        sessionAttributes['home'] = home;
        
        
        const speakOutput = `Your home station is ${home}, I will remember that from now on.`;
        const repromptOutput = `Please set your home metro station.`;
        
        return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptOutput)
        .getResponse();
    }
};

// intent handler for when user has already set home, so just need direction & line color
const UserSetsRouteIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'UserSetsRouteIntent';
  },
  async handle(handlerInput) {
      
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const startingMetroStation = sessionAttributes['home'];
      
    // call the api to retrieve list of stations corresponding to station codes
    let stationResponse = await axios.get(`https://api.wmata.com/Rail.svc/json/jStations`, {headers: {"api_key": "18271ead88f0493da104166932da85d6"}});
    let stationArray = stationResponse.data["Stations"];
    let stationCode;
    let speakOutput;
    let minuteArray = [];
    
    // Extract the busNumber and busDirection from the intent
    const { requestEnvelope } = handlerInput;
    // convert speaker's synonyms into canonical slot value
    const getCanonicalSlot = (slot) => {
        if (slot.resolutions && slot.resolutions.resolutionsPerAuthority.length) {
            for (let resolution of slot.resolutions.resolutionsPerAuthority) {
                if (resolution.status && resolution.status.code === 'ER_SUCCESS_MATCH') {
                    return resolution.values[0].value.name;
                }
            }
        }
    }
    
    const metroLine = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'metroLine'));
    const metroDirection = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'metroDirection'));
    
    // find the stationcode of the starting metro station 
    stationArray.forEach((station) => {
        if (station["Name"].toLowerCase() === startingMetroStation){
            stationCode = station["Code"];
        }
        
    })
    
    // if the name is valid -> there exists a valid station code
    if (stationCode){
        // call the api & find the next train
        //speakOutput = `checking the API for ${stationCode} and ${startingMetroStation}`;
        let timeResponse = await axios.get(`https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${stationCode}`, {
                                                                                            headers: {"api_key": "18271ead88f0493da104166932da85d6"}});
        let timeArray = timeResponse.data["Trains"];
        // match destination & line color
        timeArray.forEach((train) => 
        {
            if (train["DestinationName"].toLowerCase() === metroDirection && train["Line"] === metroLine)
            {
                // grab the minute info
                let minutes = train["Min"];
                // push the minutes to the array
                minuteArray.push(minutes);
                //speakOutput = `The next ${metroLine} train from ${startingMetroStation} to ${metroDirection} is in ${minutes} minutes}`;
            }
            // if either destination or line color doesn't match
        });
        if (minuteArray.length === 0)
        {
            speakOutput = `Your direction ${metroDirection} or line color ${metroLine} is not valid for the starting station ${startingMetroStation}.`;
        }
        else
        {
            let minMinute = Math.min(minuteArray);
            speakOutput = `The next ${metroLine} train from ${startingMetroStation} to ${metroDirection} is in ${minMinute} minutes`;
        }
        //speakOutput = JSON.stringify(timeResponse.data["Trains"]);
    }
    else{
        speakOutput = `we could not find the station: ${startingMetroStation}`;
    }
    /*
    // Given the bus number and direction, get the corresponding bus stop number from the CTA config file
    const busStop = CTA_CONFIG.config.BUS_STOPS[busNumber][busDirection.toLowerCase()];
    // Construct the params needed for the API call
    const params = {
        key: CTA_CONFIG.config.BUS_API_KEY,
        format: 'json',
        rt: busNumber,
        stpid: busStop
    };
    // Execute the API call to get the real-time next bus predictions
    let response = await axios.get(`${CTA_CONFIG.config.BUS_ROOT_URL}bustime/api/v2/getpredictions`, {params: params});
    // Respond with the user provided number and direction to confirm the intent functionality
    // Define the speakOutput string variable, then populate accordingly
    let speakOutput;
    // Check to ensure there is a 'bustime-response' object
    if(response && response.data && response.data['bustime-response']){
    // Check to ensure there are available prediction times
        if(response.data['bustime-response'].prd && 0 < response.data['bustime-response'].prd.length){
        // Extract the next prediction time
        let nextTime = response.data['bustime-response'].prd[0].prdctdn;
        // Construct the next bus arrival speech output with the given time retrieved
        speakOutput = `${nextTime} minutes until the next ${busDirection}-bound ${busNumber} bus.`;
        }else if (response.data['bustime-response'].error && 0 < response.data['bustime-response'].error.length){
        // If in this block, there are no available next arrival times for the given bus stop
        speakOutput = `No available arrival times for bus #${busNumber} ${busDirection}-bound.`;
        }else{
        speakOutput = `An error has occurred while retrieving next time for bus #${busNumber} ${busDirection}-bound.`;
        }
    }else{
    speakOutput = `An error has occurred while retrieving next time for bus #${busNumber} ${busDirection}-bound.`;
    }
    */

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true) // Force the skill to close once intent handled
      .getResponse();
  }
};

const NextBusIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetNextBusIntent';
  },
  async handle(handlerInput) {
      
    // call the api to retrieve list of stations corresponding to station codes
    let stationResponse = await axios.get(`https://api.wmata.com/Rail.svc/json/jStations`, {headers: {"api_key": "18271ead88f0493da104166932da85d6"}});
    let stationArray = stationResponse.data["Stations"];
    let stationCode;
    let speakOutput;
    let minuteArray = [];
    
    // Extract the busNumber and busDirection from the intent
    const { requestEnvelope } = handlerInput;
    // convert speaker's synonyms into canonical slot value
    const getCanonicalSlot = (slot) => {
        if (slot.resolutions && slot.resolutions.resolutionsPerAuthority.length) {
            for (let resolution of slot.resolutions.resolutionsPerAuthority) {
                if (resolution.status && resolution.status.code === 'ER_SUCCESS_MATCH') {
                    return resolution.values[0].value.name;
                }
            }
        }
    }
    
    const startingMetroStation = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'startingMetroStation'));
    const metroLine = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'metroLine'));
    const metroDirection = getCanonicalSlot(Alexa.getSlot(requestEnvelope, 'metroDirection'));
    
    // find the stationcode of the starting metro station 
    stationArray.forEach((station) => {
        if (station["Name"].toLowerCase() === startingMetroStation){
            stationCode = station["Code"];
        }
        
    })
    
    // if the name is valid -> there exists a valid station code
    if (stationCode){
        // call the api & find the next train
        //speakOutput = `checking the API for ${stationCode} and ${startingMetroStation}`;
        let timeResponse = await axios.get(`https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${stationCode}`, {
                                                                                            headers: {"api_key": "18271ead88f0493da104166932da85d6"}});
        let timeArray = timeResponse.data["Trains"];
        // match destination & line color
        timeArray.forEach((train) => 
        {
            if (train["DestinationName"].toLowerCase() === metroDirection && train["Line"] === metroLine)
            {
                // grab the minute info
                let minutes = train["Min"];
                // push the minutes to the array
                minuteArray.push(minutes);
                //speakOutput = `The next ${metroLine} train from ${startingMetroStation} to ${metroDirection} is in ${minutes} minutes}`;
            }
            // if either destination or line color doesn't match
        });
        if (minuteArray.length === 0)
        {
            speakOutput = `Your direction ${metroDirection} or line color ${metroLine} is not valid for the starting station ${startingMetroStation}.`;
        }
        else
        {
            let minMinute = Math.min(minuteArray);
            speakOutput = `The next ${metroLine} train from ${startingMetroStation} to ${metroDirection} is in ${minMinute} minutes`;
        }
        //speakOutput = JSON.stringify(timeResponse.data["Trains"]);
    }
    else{
        speakOutput = `we could not find the station: ${startingMetroStation}`;
    }
    /*
    // Given the bus number and direction, get the corresponding bus stop number from the CTA config file
    const busStop = CTA_CONFIG.config.BUS_STOPS[busNumber][busDirection.toLowerCase()];
    // Construct the params needed for the API call
    const params = {
        key: CTA_CONFIG.config.BUS_API_KEY,
        format: 'json',
        rt: busNumber,
        stpid: busStop
    };
    // Execute the API call to get the real-time next bus predictions
    let response = await axios.get(`${CTA_CONFIG.config.BUS_ROOT_URL}bustime/api/v2/getpredictions`, {params: params});
    // Respond with the user provided number and direction to confirm the intent functionality
    // Define the speakOutput string variable, then populate accordingly
    let speakOutput;
    // Check to ensure there is a 'bustime-response' object
    if(response && response.data && response.data['bustime-response']){
    // Check to ensure there are available prediction times
        if(response.data['bustime-response'].prd && 0 < response.data['bustime-response'].prd.length){
        // Extract the next prediction time
        let nextTime = response.data['bustime-response'].prd[0].prdctdn;
        // Construct the next bus arrival speech output with the given time retrieved
        speakOutput = `${nextTime} minutes until the next ${busDirection}-bound ${busNumber} bus.`;
        }else if (response.data['bustime-response'].error && 0 < response.data['bustime-response'].error.length){
        // If in this block, there are no available next arrival times for the given bus stop
        speakOutput = `No available arrival times for bus #${busNumber} ${busDirection}-bound.`;
        }else{
        speakOutput = `An error has occurred while retrieving next time for bus #${busNumber} ${busDirection}-bound.`;
        }
    }else{
    speakOutput = `An error has occurred while retrieving next time for bus #${busNumber} ${busDirection}-bound.`;
    }
    */

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true) // Force the skill to close once intent handled
      .getResponse();
  }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const LoadAttributesRequestInterceptor = {
    async process(handlerInput) {
        const {attributesManager, requestEnvelope} = handlerInput;
        if (Alexa.isNewSession(requestEnvelope)){ //is this a new session? this check is not enough if using auto-delegate (more on next module)
            const persistentAttributes = await attributesManager.getPersistentAttributes() || {};
            console.log('Loading from persistent storage: ' + JSON.stringify(persistentAttributes));
            //copy persistent attribute to session attributes
            attributesManager.setSessionAttributes(persistentAttributes); // ALL persistent attributtes are now session attributes
        }
    }
};

// If you disable the skill and reenable it the userId might change and you lose the persistent attributes saved below as userId is the primary key
const SaveAttributesResponseInterceptor = {
    async process(handlerInput, response) {
        if (!response) return; // avoid intercepting calls that have no outgoing response due to errors
        const {attributesManager, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const shouldEndSession = (typeof response.shouldEndSession === "undefined" ? true : response.shouldEndSession); //is this a session end?
        if (shouldEndSession || Alexa.getRequestType(requestEnvelope) === 'SessionEndedRequest') { // skill was stopped or timed out
            // we increment a persistent session counter here
            sessionAttributes['sessionCounter'] = sessionAttributes['sessionCounter'] ? sessionAttributes['sessionCounter'] + 1 : 1;
            // we make ALL session attributes persistent
            console.log('Saving to persistent storage:' + JSON.stringify(sessionAttributes));
            attributesManager.setPersistentAttributes(sessionAttributes);
            await attributesManager.savePersistentAttributes();
        }
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        NextBusIntentHandler,
        UserSetsRouteIntentHandler,
        UserSetsHomeIntentHander,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(
        LoadAttributesRequestInterceptor)
    .addResponseInterceptors(
        SaveAttributesResponseInterceptor)
    .withPersistenceAdapter(persistenceAdapter)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();