import React from 'react';
import { View, ViewProps } from 'react-native';

// Web placeholder for MapView
export const MapView: React.FC<ViewProps & {
  initialRegion?: any;
  onPress?: (event: any) => void;
  children?: React.ReactNode;
}> = ({ style, children, ...props }) => {
  return (
    <View style={style} {...props}>
      {children}
    </View>
  );
};

// Web placeholder for Marker
export const Marker: React.FC<{
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
}> = () => {
  return null;
};