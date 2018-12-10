#include <Arduino.h>
#include <NeoPixelBus.h>
#include <LinkedList.h>
#include <SPIFFS.h>
// Hardware
const uint16_t PixelCount = 10; // this example assumes 4 pixels, making it smaller will cause a failure
const uint8_t PixelPin = 22;  // make sure to set this to the correct pin, ignored for Esp8266
NeoPixelBus<NeoGrbFeature, Neo800KbpsMethod> strip(PixelCount, PixelPin);



// Bluetooth crap
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/
#define SERVICE_UUID        "dea7f73c-723c-4ba2-b769-9c0f43293653"
const char BTCH_PROGRAM[] = "d7b710fb-74d5-4413-a94d-38e387e55745";
const char BTCH_KEY[] = "d7b710fb-74d5-4413-a94d-38e387e55746";


// Programs
uint8_t program = 1; //3;
const uint8_t PROGRAM_PIANO = 0;
const uint8_t PROGRAM_RANDOM = 1;				// Pseudoprogram
const uint8_t PROGRAM_RAINBOW = 10;
const uint8_t PROGRAM_TWINKLE = 11;
const uint8_t PROGRAM_RG_FADE = 12;
const uint8_t PROGRAM_RAINBOW_FADE = 13;
const uint8_t PROGRAM_RAINBOW_FADE_SPLIT = 14;
const uint8_t PROGRAM_RAINBOW_STATIC = 15;
const uint8_t PROGRAM_RAINBOW_AROUND = 16;
const uint8_t PROGRAM_RAINBOW_FLASHES = 17;


long last_note_played = -1;
long last_tick = 0;
long bauble_ticks[PixelCount] = {0};	// Contains timestamps of when they last ticked
long last_program_tick = 0;
long last_random = 0;
uint8_t rand_program = 1;



// Returns the actively playing program
uint8_t getActiveProgram(){
	
	if( ~last_note_played && millis() < last_note_played+10000 )
		return PROGRAM_PIANO;

	if( program == PROGRAM_RANDOM )
		return rand_program;

	return program;

}

// Returns the index of the lowest value intensity
uint8_t getLowestTwinkle(){
	long lowest = -1;
	LinkedList<uint8_t> viable_indexes;
	for( uint8_t i =0; i<PixelCount; ++i ){
		long val = bauble_ticks[i];
		if( val < lowest || lowest == -1 ){
			viable_indexes = LinkedList<uint8_t>();
			viable_indexes.add(i);
			lowest = val;
		}
		else if( val == lowest )
			viable_indexes.add(i);
	}

	return viable_indexes.get(random(0,viable_indexes.size()));
}

void triggerTwinkle(){
	long ms = millis();
	uint8_t index = getLowestTwinkle();
	bauble_ticks[index] = ms;
	last_program_tick = ms;
}


class MyCallbacks: public BLECharacteristicCallbacks {

	void onWrite(BLECharacteristic *pCharacteristic) {

		std::string value = pCharacteristic->getValue();
		String uuid = String(pCharacteristic->getUUID().toString().c_str());
		
		if( uuid == String(BTCH_KEY) ){
			last_note_played = millis();
			uint8_t val = pCharacteristic->getData()[0];
			if( val < 1 )
				val = 1;
			if( val > PixelCount )
				val = PixelCount;
			for( uint8_t i = 0; i<val; ++i )
				triggerTwinkle();
		}
		else if( uuid == String(BTCH_PROGRAM) ){

			uint8_t val = pCharacteristic->getData()[0];
			if( val > 0 )
				program = val;
			Serial.printf("Setting program to %i\n", val);
			File file = SPIFFS.open("/program", FILE_WRITE);
			if( file )
				file.print(String(val).c_str());

		}

		/*
		if (value.length() > 0) {
			Serial.println("*********");
			Serial.print("New value: ");
			for (int i = 0; i < value.length(); i++)
				Serial.print(value[i]);

			Serial.println();
			Serial.println("*********");
		}
		*/
    }

};



void setup(){

	Serial.begin(115200);
	delay(500);

	strip.Begin();

	// TODO: Bluetooth

	
	Serial.println("IT BEGINS!!");

	if( SPIFFS.begin(true) ){
		File file = SPIFFS.open("/program", FILE_READ);
		if( file ){
			String content = file.readString();
			Serial.println("File:");
			int p = content.toInt();
			if( p > 0 )
				program = p;
			Serial.printf("Program is now %i\n", program);
		}
	}else
		Serial.println("An Error has occurred while mounting SPIFFS");
		

	Serial.println("Starting BLE work!");
	MyCallbacks* callbacks = new MyCallbacks();
	BLEDevice::init("Baubles");
	BLEServer *pServer = BLEDevice::createServer();
	BLEService *pService = pServer->createService(SERVICE_UUID);
	BLECharacteristic *programCharacteristic = pService->createCharacteristic(
		BTCH_PROGRAM,
		BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_WRITE
	);
	programCharacteristic->setCallbacks(callbacks);
	programCharacteristic->setValue(&program, 1);

	
	BLECharacteristic *keyCharacteristic = pService->createCharacteristic(
		BTCH_KEY,
		BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_WRITE
	);
	//keyCharacteristic->setValue("");
	keyCharacteristic->setCallbacks(callbacks);

	pService->start();

	BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
	pAdvertising->addServiceUUID(SERVICE_UUID);
	pAdvertising->setScanResponse(true);
	pAdvertising->setMinPreferred(0x06);  // functions that help with iPhone connections issue
	pAdvertising->setMinPreferred(0x12);
	
	BLEDevice::startAdvertising();


	Serial.println("Characteristic defined! Now you can read it in your phone!");


	
}

void loop(){

    delay(16.7*2); // 60 fps
	//delay(500);
	long ms = millis();
	int offs = ms-last_tick;
	last_tick = ms;

	if( last_random+60000 < ms ){
		last_random = ms;
		rand_program = random(10,18);
	}

	uint8_t pr = getActiveProgram();

	// Automatically target a random bauble occasionally

	

	if( pr == PROGRAM_TWINKLE && ms > last_program_tick+500 )
		triggerTwinkle();

	for(int i =0; i<PixelCount; ++i){

		// Handle piano logic
		if( pr == PROGRAM_PIANO || pr == PROGRAM_TWINKLE ){

			long last_tick = bauble_ticks[i];
			float hue = (float)i/(float)PixelCount;

			int fade_ms = 1000;
			long offs = last_tick+fade_ms-ms;		// goes from fade_ms to 0
			float intensity = 0.075;
			if( offs <= 0 || last_tick == 0 )
				bauble_ticks[i] = 0;
			else{
				intensity += offs/(float)fade_ms*0.9;
				if( offs > fade_ms*0.9 && random(0,4) == 0 )
					intensity -= 0.4;
			}

			if( intensity > 1.0 )
				intensity = 1.0;

			strip.SetPixelColor(i, HslColor(hue,1,intensity));


		}
		
		else if( pr == PROGRAM_RAINBOW ){

			float o = (ms%5000)/5000.0;	// Speed adjust
			float h = o+(float)i/(float)PixelCount;			// Lower this value to "stretch" the color span. Increase to squeeze
			if( h >= 1.0 )
				h-= 1.0;
			float r = 0;
			strip.SetPixelColor(i, HslColor(h,1.0,0.5));

		}
		else if( pr == PROGRAM_RG_FADE ){

			int cycle_ms = 20000;
			float o = (ms%cycle_ms)/(float)cycle_ms;	// Speed adjust

			float basehue = 0.333;
			if( (i%2 && o < 0.5) || (!(i%2) && o >= 0.5) )
				basehue = 0.0;

			float intens = cos(o*2*TWO_PI+PI)*0.5+0.5;
			strip.SetPixelColor(i, HslColor(basehue,1.0,intens*0.5));

		}
		else if( pr == PROGRAM_RAINBOW_FADE ){

			float o = (ms%60000)/60000.0;	// Speed adjust
			strip.SetPixelColor(i, HslColor(o,1.0,0.55));

		}
		else if( pr == PROGRAM_RAINBOW_STATIC ){

			float o = i/(float)PixelCount;
			strip.SetPixelColor(i, HslColor(o,1.0,0.5));

		}
		else if( pr == PROGRAM_RAINBOW_AROUND ){

			float offset = (ms%4000)/4000.0;	// Speed adjust
			float o = i/(float)PixelCount;
			float intens = sin((offset+o)*TWO_PI)*0.5+0.5;
			strip.SetPixelColor(i, HslColor(o,1.0,intens*0.6));
		}
		else if( pr == PROGRAM_RAINBOW_FLASHES ){

			float offset = (ms%4000)/4000.0;	// Speed adjust
			float intens = 0.5;
			if( random(0, 20) == 0 )
				intens = 0.85;
			float o = i/(float)PixelCount;
			strip.SetPixelColor(i, HslColor(o,1.0,intens));
		}

		else{

			float o = (ms%60000)/60000.0;	// Speed adjust
			o += i%3*120.0/360;
			if( o > 1.0 )
				o -= 1.0;
			strip.SetPixelColor(i, HslColor(o,1.0,0.51));

		}
		
		
	}
	strip.Show();

}