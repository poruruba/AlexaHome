'use strict';

const OBNIZ_ID = process.env.OBNIZ_ID || "yObniz IDz";

const ALEXA_CLIENT_ID = process.env.ALEXA_CLIENT_ID || 'yAlexaƒNƒ‰ƒCƒAƒ“ƒgIDz';
const ALEXA_CLIENT_SECRET = process.env.ALEXA_CLIENT_SECRET || 'yAlexaƒNƒ‰ƒCƒAƒ“ƒgƒV[ƒNƒŒƒbƒgz';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';

const { URL, URLSearchParams } = require('url');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

const TOKEN_ENDPOINT_URL = 'https://api.amazon.com/auth/o2/token';

const AlexaSmartHomeUtils = require(HELPER_BASE + 'alexa-smarthome-utils');
const app = new AlexaSmartHomeUtils();

var accessToken;
var refreshToken;

var g_obniz_success;
var g_obniz_failed;

var Obniz = require("obniz");
var obniz = new Obniz(OBNIZ_ID, { auto_connect: false });
obniz.onconnect = async function () {
    console.log("connected");
    obniz.plugin.onreceive = async (data) =>{
        var str = Buffer.from(data).toString("utf-8");
        var res = JSON.parse(str);
        console.log(res);
        if( g_obniz_success )
        g_obniz_success(JSON.parse(str));
    };
}
obniz.onclose = async function(){
    console.log("obniz onclose");
    if( g_obniz_failed )
        g_obniz_failed("obniz onclose");
}

async function obniz_tranceive(intent, message){
    console.log('obniz connecting');
    await obniz.connectWait();
    console.log('obniz connected');

    return new Promise((resolve, reject) =>{
        if( obniz.connectionState != 'connected' )
            throw 'obniz disconnected';

        g_obniz_success = resolve;
        g_obniz_failed = reject;
        obniz.plugin.send(JSON.stringify({ intent: intent, value: message }));
    })
}

async function processDirective(directive){
    try{
        console.log(directive);
        var intent = directive.header.namespace + '.' + directive.header.name;
        console.log('intent: ' + intent);

        var endpointId = undefined;
        var contextResult = undefined;
        var headerResult;
        var payloadResult = {};
    
        if( intent == 'Alexa.Discovery.Discover'){
            payloadResult.endpoints = [];

            var result = await obniz_tranceive(intent);

            payloadResult.endpoints = convert_endpoint(result);
            console.log(payloadResult);

            headerResult = JSON.parse(JSON.stringify(directive.header));
            headerResult.namespace = "Alexa.Discovery";
            headerResult.name = "Discover.Response";
        }else
        if( intent == 'Alexa.PowerController.TurnOn' || intent == 'Alexa.PowerController.TurnOff' ||
            intent == 'Alexa.LockController.Lock' || intent == 'Alexa.LockController.Unlock' ){

            endpointId = directive.endpoint.endpointId;

            contextResult = await obniz_tranceive(intent, { endpointId: endpointId });

            headerResult = JSON.parse(JSON.stringify(directive.header));
            headerResult.namespace = "Alexa";
            headerResult.name = "Response";        
        }else
        if( intent == 'Alexa.ReportState' ){
            endpointId = directive.endpoint.endpointId;

            contextResult = await obniz_tranceive(intent, { endpointId: endpointId });

            headerResult = JSON.parse(JSON.stringify(directive.header));
            headerResult.namespace = "Alexa";
            headerResult.name = "StateReport";        
        }else
        if( intent == 'Alexa.PowerLevelController.SetPowerLevel' || intent == 'Alexa.PowerLevelController.AdjustPowerLevel'){

            endpointId = directive.endpoint.endpointId;
            var level;
            if( intent == 'Alexa.PowerLevelController.SetPowerLevel' )
                level = directive.payload.powerLevel;
            else if( intent == 'Alexa.PowerLevelController.AdjustPowerLevel')
                level = directive.payload.powerLevelDelta;

            contextResult = await obniz_tranceive(intent, { endpointId: endpointId, level: level });

            headerResult = JSON.parse(JSON.stringify(directive.header));
            headerResult.namespace = "Alexa";
            headerResult.name = "Response";        
        }else
        if( intent == 'Alexa.Authorization.AcceptGrant' ){
            var code = directive.payload.grant.code;

            var body = {
                grant_type: 'authorization_code',
                code: code,
                client_id: ALEXA_CLIENT_ID,
                client_secret: ALEXA_CLIENT_SECRET
            };
            var json = await do_post(TOKEN_ENDPOINT_URL, body);
            console.log(json);

            accessToken = json.access_token;
            refreshToken = json.refresh_token;

            new Promise(async (resolve, reject) =>{
                await obniz_tranceive("Alexa.Authorization.AcceptGrant", { accessToken: accessToken, refreshToken: refreshToken});
                resolve();
            });

            headerResult = JSON.parse(JSON.stringify(directive.header));
            headerResult.namespace = "Alexa.Authorization";
            headerResult.name = "AcceptGrant.Response";        
        }else
        {
            console.log('Unknown intent:' + intent);
            throw "Unknown intent:" + intent;
        }

        var response = {
            event: {
                header: headerResult,
                payload: payloadResult
            }
        };
        if( contextResult )
            response.context = contextResult;
        if( endpointId )
            response.event.endpoint = { endpointId: endpointId };
    
        return response;
    }catch(error){
        console.error("Error:" + error);
        throw error;
    }finally{
        obniz.close();        
    }
}

function convert_endpoint(result){
    var endpoints = [];
    for( var i = 0 ; i < result.devices.length ; i++ ){
      var device = result.devices[i];
      if( device.deviceType == 0){
        // PowerController = 0,
        var endpoint = {};
        endpoint.endpointId = device.endpointId;
        endpoint.manufacturerName = result.manufacturerName;
        endpoint.friendlyName = device.friendlyName;
        endpoint.description = device.description;
        endpoint.displayCategories = [device.displayCategory];
        endpoint.capabilities = [
          {
            "type": "AlexaInterface",
            "interface": "Alexa",
            "version": "3"
          },
          {
              "type": "AlexaInterface",
              "interface": "Alexa.PowerController",
              "version": "3",
              "properties": {
                  "supported": [
                      {
                          "name": "powerState"
                      }
                  ],
                  "proactivelyReported": device.proactivelyReported,
                  "retrievable": device.retrievable
              }
          }
        ];
        endpoints.push(endpoint);
      }else if( device.deviceType == 1){
        // LockController = 1,
        var endpoint = {};
        endpoint.endpointId = device.endpointId;
        endpoint.manufacturerName = result.manufacturerName;
        endpoint.friendlyName = device.friendlyName;
        endpoint.description = device.description;
        endpoint.displayCategories = [device.displayCategory];
        endpoint.capabilities = [
          {
            "type": "AlexaInterface",
            "interface": "Alexa",
            "version": "3"
          },
          {
              "type": "AlexaInterface",
              "interface": "Alexa.LockController",
              "version": "3",
              "properties": {
                  "supported": [
                      {
                          "name": "lockState"
                      }
                  ],
                  "proactivelyReported": device.proactivelyReported,
                  "retrievable": device.retrievable
              }
          }
        ];
        endpoints.push(endpoint);
      }else if( device.deviceType == 2){
        // TemperatureSensor = 2,
        var endpoint = {};
        endpoint.endpointId = device.endpointId;
        endpoint.manufacturerName = result.manufacturerName;
        endpoint.friendlyName = device.friendlyName;
        endpoint.description = device.description;
        endpoint.displayCategories = [device.displayCategory];
        endpoint.capabilities = [
          {
            "type": "AlexaInterface",
            "interface": "Alexa",
            "version": "3"
          },
          {
              "type": "AlexaInterface",
              "interface": "Alexa.TemperatureSensor",
              "version": "3",
              "properties": {
                  "supported": [
                      {
                          "name": "temperature"
                      }
                  ],
                  "proactivelyReported": device.proactivelyReported,
                  "retrievable": device.retrievable
              }
          }
        ];
        endpoints.push(endpoint);        
      }else if( device.deviceType == 3){
        // PowerLevelController = 3,
        var endpoint = {};
        endpoint.endpointId = device.endpointId;
        endpoint.manufacturerName = result.manufacturerName;
        endpoint.friendlyName = device.friendlyName;
        endpoint.description = device.description;
        endpoint.displayCategories = [device.displayCategory];
        endpoint.capabilities = [
          {
            "type": "AlexaInterface",
            "interface": "Alexa",
            "version": "3"
          },
          {
            "type": "AlexaInterface",
            "interface": "Alexa.PowerLevelController",
            "version": "3",
            "properties": {
                "supported": [
                    {
                        "name": "powerLevel"
                    }
                ],
                "proactivelyReported": device.proactivelyReported,
                "retrievable": device.retrievable
            }
          },          
          {
              "type": "AlexaInterface",
              "interface": "Alexa.PowerController",
              "version": "3",
              "properties": {
                  "supported": [
                      {
                          "name": "powerState"
                      }
                  ],
                  "proactivelyReported": device.proactivelyReported,
                  "retrievable": device.retrievable
              }
          }
        ];
        endpoints.push(endpoint);
      }
    }

    return endpoints;
}

function do_post(url, body) {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  
    return fetch(new URL(url).toString(), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: headers
      })
      .then((response) => {
        if (!response.ok)
          throw 'status is not 200';
        return response.json();
      });
}

app.intent('Alexa.Discovery.Discover', async (handlerInput, context) => {
    console.log('Alexa.Discovery.Discover called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.PowerController.TurnOn', async (handlerInput, context) => {
    console.log('Alexa.PowerController.TurnOn called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.PowerController.TurnOff', async (handlerInput, context) => {
    console.log('Alexa.PowerController.TurnOff called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.LockController.Lock', async (handlerInput, context) => {
    console.log('Alexa.LockController.Lock called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.LockController.Unlock', async (handlerInput, context) => {
    console.log('Alexa.LockController.Unlock called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.PowerLevelController.SetPowerLevel', async (handlerInput, context) => {
    console.log('Alexa.PowerLevelController.SetPowerLevel called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.PowerLevelController.AdjustPowerLevel', async (handlerInput, context) => {
    console.log('Alexa.PowerLevelController.AdjustPowerLevel called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.ReportState', async (handlerInput, context) => {
    console.log('Alexa.ReportState called.');
    
    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

app.intent('Alexa.Authorization.AcceptGrant', async (handlerInput, context) => {
    console.log('Alexa.Authorization.AcceptGrant called.');

    var response = await processDirective(handlerInput.directive);
    context.succeed(response);
});

exports.handler = app.handle();
