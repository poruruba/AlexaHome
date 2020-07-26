'use strict';

//const ACCESSTOKEN = "【アクセストークン】";

const { URL, URLSearchParams } = require('url');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

async function send_event(body, accessToken){
	var header = {
	    namespace: "Alexa",
	    name: "ChangeReport",
	    payloadVersion: "3",
	    messageId: "message1"
	};
	var endpoint = {
	    scope: {
	        type: "BearerToken",
	        token: accessToken
	    },
	    endpointId: body.endpointId
	};
	var payload = {
	    change: {
	        cause: {
	            type: body.type
	        },
	        properties: [
	            {
	                namespace: "Alexa.PowerController",
	                name: "powerState",
	                value: body.value,
	            }
	        ]
	    }
	};
	var request = {
	    context: {
	        properties:[]
	    },
	    event: {
	        header: header,
	        endpoint: endpoint,
	        payload: payload
	    }
	}

	try{
	    console.log(request);
	    await do_post_eventgateway(EVENT_GATEWAY_URL, request, accessToken);
	}catch(error){
		console.error(error);
		throw error;
	}
}

const EVENT_GATEWAY_URL = 'https://api.fe.amazonalexa.com/v3/events';

function do_post_eventgateway(url, body, token) {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Authorization": "Bearer " + token });
  
    return fetch(new URL(url).toString(), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: headers
      })
      .then((response) => {
        if (!response.ok){
            console.error("status=" + response.status);
            response.json().then(reason =>{ console.log(reason)});
            throw 'status is not 200';
        }
        return response.text();
      });
}

var body = {
	value: "ON",
	endpointId: "device",
	type: "PHYSICAL_INTERACTION",
};
send_event(body, ACCESSTOKEN);
