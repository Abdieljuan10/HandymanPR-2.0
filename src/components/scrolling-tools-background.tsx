import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

// The source pattern's own intrinsic size (assets/images/tools-pattern.png).
// Height/width ratio is what actually matters -- it lets each tile be scaled
// to the device's screen width while keeping the pattern's own proportions,
// rather than baking in device-specific pixel math.
const PATTERN_WIDTH = 1072;
const PATTERN_HEIGHT = 2262;
const PATTERN_ASPECT = PATTERN_HEIGHT / PATTERN_WIDTH;

// Drift speed: dp of vertical travel per second. Slow and gentle on purpose
// -- this sits behind form fields and buttons, not the point of the screen.
const DP_PER_SECOND = 14;

// The pattern's own base tone (assets/images/tools-pattern.png background) --
// used here so the screen behind this component can't show a mismatched
// color in the sliver of a frame where layout hasn't settled yet.
export const ToolsPatternBackgroundColor = '#EAF3F1';

/**
 * A slow, seamlessly-looping vertical drift of the tools pattern, meant to
 * sit as an absolute-fill decorative layer behind a screen's real content.
 * Seamless loop works because each stacked tile is identical: translating
 * the whole stack down by exactly one tile's height looks pixel-identical
 * to the untransformed state, so resetting to 0 there is invisible.
 */
export function ScrollingToolsBackground() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const tileHeight = screenWidth * PATTERN_ASPECT;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(tileHeight, { duration: (tileHeight / DP_PER_SECOND) * 1000, easing: Easing.linear }),
      -1,
      false
    );
  }, [tileHeight, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value - tileHeight }],
  }));

  // One extra tile above (covered by the -tileHeight starting offset, so a
  // downward drift never reveals blank space at the top) plus enough below
  // to cover the tallest possible translated position.
  const tileCount = Math.ceil(screenHeight / tileHeight) + 2;

  return (
    <View style={[styles.container, { backgroundColor: ToolsPatternBackgroundColor }]} pointerEvents="none">
      <Animated.View style={animatedStyle}>
        {Array.from({ length: tileCount }).map((_, index) => (
          <Image
            key={index}
            source={require('@/assets/images/tools-pattern.png')}
            style={{ width: screenWidth, height: tileHeight }}
            contentFit="cover"
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
});
