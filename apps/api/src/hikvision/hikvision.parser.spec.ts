import { parseChannels, parseDeviceInfo } from "./hikvision.parser";

describe("Hikvision XML parser", () => {
	it("parses namespaced device information", () => {
		const result = parseDeviceInfo(
			'<DeviceInfo xmlns="urn:self"><deviceName>HIKVISION</deviceName><model>DS-7608</model><serialNumber>ABC</serialNumber><firmwareVersion>V4</firmwareVersion></DeviceInfo>',
		);
		expect(result).toMatchObject({
			manufacturer: "HIKVISION",
			model: "DS-7608",
			serialNumber: "ABC",
		});
	});

	it("deduplicates main and sub streaming profiles into channels", () => {
		const xml =
			"<StreamingChannelList><StreamingChannel><id>101</id><name>Lobby</name></StreamingChannel><StreamingChannel><id>102</id><name>Lobby sub</name></StreamingChannel><StreamingChannel><id>201</id><name>Parking</name></StreamingChannel></StreamingChannelList>";
		expect(parseChannels(xml)).toEqual([
			{ channelNumber: 1, sourceName: "Lobby" },
			{ channelNumber: 2, sourceName: "Parking" },
		]);
	});
});
