module.exports = function (api) {
  api.cache(true);
  return {
    // BEZ NativeWind JSX omotavanja: `className` se na native strani ne koristi
    // (stilovi idu kroz StyleSheet + useThemeColors), a react-native-css-interop
    // 0.2.6 omotač oko Pressable GUTA funkcijski `style={({ pressed }) => ...}`
    // — svi takvi Pressable-i su renderovali potpuno bez stila. Metro strana
    // (withNativeWind za global.css) ostaje.
    presets: ['babel-preset-expo'],
  };
};
