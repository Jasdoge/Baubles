# Baubles
Bluetooth enabled neopixel baubles.

Todo: Add the video

This is a project that lets you setup fancy christmas lights with neopixels and an ESP32. If you're content with a cap of about 13 neopixels you can wire the power directly to your ESP32 board's 5V output. If you need more you'll need a decent power supply and wire the neopixel power and ESP separately.

Relies on the [NeopixelBus library](https://github.com/Makuna/NeoPixelBus). If you get errors with bluetooth you may need to update your [ESP32 libraries as well](https://github.com/espressif/arduino-esp32).

The only thing you need to change is in Lights_Firmware/Lights_Firmware.ino `const uint16_t PixelCount = 10;` to your number of pixels.

This project also includes the App folder with a web app that uses web bluetooth to connect to the pixels. Most modern smartphones support the feature nowadays.
