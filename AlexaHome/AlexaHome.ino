#include <obniz.h>

//#define M5STICKC

#ifdef M5STICKC
#include <M5StickC.h>
#endif

#include <ArduinoJson.h>

#define MAX_DEVICES 4
const int message_capacity = JSON_OBJECT_SIZE(3 + MAX_DEVICES) + MAX_DEVICES * JSON_OBJECT_SIZE(9) + JSON_ARRAY_SIZE(MAX_DEVICES);
StaticJsonDocument<message_capacity> json_message;
char message_buffer[1024];

const char* manufacturerName = "Smart Home Inc.";
char g_accessToken[512] = "";
char g_refreshToken[512] = "";

#define LED_IO GPIO_NUM_10
bool onlineFlg = false;

enum DeviceType{
  PowerController = 0,
  LockController = 1,
  TemperatureSensor = 2,
  PowerLevelController = 3,
};

enum LockState{
  UNLOCKED = 0,
  LOCKED,
  JAMED
};

typedef struct{
  char* endpointId;
  enum DeviceType deviceType;
  char* friendlyName;
  char* description;
  char* displayCategory;
  bool proactivelyReported;
  bool retrievable;
}DEVICE_INFO;

DEVICE_INFO devices[] = {
  {
    "device1",
    PowerController,
    "テストのトグル",
    "description1",
    "SWITCH",
    true,
    true
  },
  {
    "device2",
    TemperatureSensor,
    "テストのサーモ",
    "description2",
    "TEMPERATURE_SENSOR",
    false,
    true
  },
  {
    "device3",
    LockController,
    "テストのロック",
    "description3",
    "SMARTLOCK",
    true,
    true
  },
  {
    "device4",
    PowerLevelController,
    "テストのパワーレベル",
    "description4",
    "LIGHT",
    true,
    true
  }
};

bool device1_State = false;
enum LockState device3_State = UNLOCKED;
bool device4_State = false;
double device4_StateLevel = 0.0;

void debug_dump(const uint8_t *p_bin, uint16_t len){
  for( uint16_t i = 0 ; i < len ; i++ ){
    Serial.print((p_bin[i] >> 4) & 0x0f, HEX);
    Serial.print(p_bin[i] & 0x0f, HEX);
  }
  Serial.println("");
}

void onEvent(os_event_t event, uint8_t* data, uint16_t length) {
  switch (event) {
  case PLUGIN_EVENT_NETWORK_CLOUD_CONNECTED:
    Serial.println("cloud Connected");
    onlineFlg = true;
    digitalWrite(LED_IO, device1_State ? LOW : HIGH);
    break;
  case PLUGIN_EVENT_NETWORK_CLOUD_DISCONNECTED:
    Serial.println("cloud Disconnected");
    onlineFlg = false;
    break;
  }
}

void onCommand(uint8_t* data, uint16_t length){
  Serial.println("\nonCommand");
//  Serial.write(data, length);
//  Serial.println("");

  DeserializationError err = deserializeJson(json_message, data, length);
  if( err ){
    Serial.println("Deserialize error");
    Serial.println(err.c_str());
    return;
  }

  const char* intent = json_message["intent"];
  Serial.println(intent);
  if(strcmp(intent, "Alexa.Discovery.Discover") == 0){
    json_message.clear();
    json_message["manufacturerName"] = manufacturerName;
    for( int i = 0 ; i < sizeof(devices) / sizeof(DEVICE_INFO) ; i++ ){
      json_message["devices"][i]["endpointId"] = devices[i].endpointId;
      json_message["devices"][i]["deviceType"] = devices[i].deviceType;
      json_message["devices"][i]["friendlyName"] = devices[i].friendlyName;
      json_message["devices"][i]["description"] = devices[i].description;
      json_message["devices"][i]["displayCategory"] = devices[i].displayCategory;
      json_message["devices"][i]["proactivelyReported"] = devices[i].proactivelyReported;
      json_message["devices"][i]["retrievable"] = devices[i].retrievable;
    }
    
  }else
  if(strcmp(intent, "Alexa.Authorization.AcceptGrant") == 0){
    const char* accessToken = json_message["value"]["accessToken"];
    const char* refreshToken = json_message["value"]["refreshToken"];

    strcpy(g_accessToken, accessToken);
    strcpy(g_refreshToken, refreshToken);

    Serial.print("accessToken=");
    debug_dump((uint8_t*)g_accessToken, strlen(g_accessToken));
    
    json_message.clear();
  }else
  {
    const char* endpointId = json_message["value"]["endpointId"];
    Serial.println(endpointId);
    if( strcmp(intent, "Alexa.PowerController.TurnOn") == 0 || strcmp(intent, "Alexa.PowerController.TurnOff") == 0 ){
      bool turn = (strcmp(intent, "Alexa.PowerController.TurnOn") == 0) ? true : false;
      if( strcmp(endpointId, "device1") == 0 ){
        device1_State = turn;
        digitalWrite(LED_IO, device1_State ? LOW : HIGH);
      }else if( strcmp(endpointId, "device4") == 0 ){
        device4_State = turn;
#ifdef M5STICKC
        M5.Lcd.fillScreen(BLACK);
        M5.Lcd.setCursor(0, 0);
        M5.Lcd.println(device4_State ? "ON" : "OFF");
        M5.Lcd.println(device4_StateLevel);
#endif
      }
      
      json_message.clear();
      json_message["properties"][0]["namespace"] = "Alexa.PowerController";
      json_message["properties"][0]["name"] = "powerState";
      json_message["properties"][0]["value"] = turn ? "ON" : "OFF";
    }else
    if( strcmp(intent, "Alexa.LockController.Lock") == 0 || strcmp(intent, "Alexa.LockController.Unlock") == 0 ){
      enum LockState lock = (strcmp(intent, "Alexa.LockController.Lock") == 0) ? LOCKED : UNLOCKED;
      device3_State = lock;

      json_message.clear();
      json_message["properties"][0]["namespace"] = "Alexa.LockController";
      json_message["properties"][0]["name"] = "lockState";
      json_message["properties"][0]["value"] = (device3_State == LOCKED) ? "LOCKED" : "UNLOCKED";
    }else
    if( strcmp(intent, "Alexa.PowerLevelController.SetPowerLevel") == 0 || strcmp(intent, "Alexa.PowerLevelController.AdjustPowerLevel") == 0 ){
      double level = json_message["value"]["level"];
      if( strcmp(intent, "Alexa.PowerLevelController.SetPowerLevel") == 0 ){
        device4_StateLevel = level;
      }else if( strcmp(intent, "Alexa.PowerLevelController.AdjustPowerLevel") == 0 ){
        device4_StateLevel += level;
      }
#ifdef M5STICKC
      M5.Lcd.fillScreen(BLACK);
      M5.Lcd.setCursor(0, 0);
      M5.Lcd.println(device4_State ? "ON" : "OFF");
      M5.Lcd.println(device4_StateLevel);
#endif
      
      json_message.clear();
      json_message["properties"][0]["namespace"] = "Alexa.PowerLevelController";
      json_message["properties"][0]["name"] = "powerLevel";
      json_message["properties"][0]["value"] = device4_StateLevel;
      
    }else
    if( strcmp(intent, "Alexa.ReportState") == 0 ){
      if( strcmp(endpointId, "device4") == 0){
        json_message.clear();
        json_message["properties"][0]["namespace"] = "Alexa.PowerLevelController";
        json_message["properties"][0]["name"] = "powerLevel";
        json_message["properties"][0]["value"] = device4_StateLevel;
        json_message["properties"][1]["namespace"] = "Alexa.PowerController";
        json_message["properties"][1]["name"] = "powerState";
        json_message["properties"][1]["value"] = device4_State ? "ON" : "OFF";
      }else
      if( strcmp(endpointId, "device3") == 0){
        json_message.clear();
        json_message["properties"][0]["namespace"] = "Alexa.LockController";
        json_message["properties"][0]["name"] = "lockState";
        json_message["properties"][0]["value"] = (device3_State == LOCKED) ? "LOCKED" : "UNLOCKED";
      }else
      if( strcmp(endpointId, "device2") == 0){
        json_message.clear();
        json_message["properties"][0]["namespace"] = "Alexa.TemperatureSensor";
        json_message["properties"][0]["name"] = "temperature";
        json_message["properties"][0]["value"]["value"] = temperatureRead();
        json_message["properties"][0]["value"]["scale"] = "CELSIUS";
      }else
      if( strcmp(endpointId, "device1") == 0){
        json_message.clear();
        json_message["properties"][0]["namespace"] = "Alexa.PowerController";
        json_message["properties"][0]["name"] = "powerState";
        json_message["properties"][0]["value"] = device1_State ? "ON" : "OFF";
      }else
      {
        Serial.println("Unknown endpointId");
      }
    }else{      
      Serial.println("Unknown Intent");
    }
  }

  serializeJson(json_message, message_buffer, sizeof(message_buffer));
  obniz.commandSend((uint8_t*)message_buffer, strlen(message_buffer));
}

void setup() {
#ifdef M5STICKC
  M5.begin();
  M5.Axp.ScreenBreath(9);
  M5.Lcd.setRotation(3);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.print("SmartHome");
  delay(500);
#endif

  Serial.begin(9600);
  obniz.onEvent(onEvent);
  obniz.commandReceive(onCommand);
  obniz.start();
  pinMode(LED_IO, OUTPUT);
  digitalWrite(LED_IO, device1_State ? LOW : HIGH);

#ifdef M5STICKC
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.println(device4_State ? "ON" : "OFF");
  M5.Lcd.println(device4_StateLevel);
#endif
}

void loop() {
#ifdef M5STICKC
  M5.update();
#endif
  
  if( !onlineFlg ){
    digitalWrite(LED_IO, HIGH);
    delay(500);
    digitalWrite(LED_IO, LOW);
    delay(500);
  }
}
