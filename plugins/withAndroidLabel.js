// Sets the Android launcher label (the project name must stay ASCII for the native projects).
const { AndroidConfig, withStringsXml } = require('expo/config-plugins');

module.exports = function withAndroidLabel(config, label) {
  return withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem([{ $: { name: 'app_name' }, _: label }], c.modResults);
    return c;
  });
};
