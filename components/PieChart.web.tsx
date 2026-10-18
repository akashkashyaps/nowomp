import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';
interface PieChartData {
  name: string;
  count: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

interface PieChartProps {
  data: PieChartData[];
  width: number;
  height: number;
  chartConfig?: any;
  accessor?: string;
  backgroundColor?: string;
  paddingLeft?: string;
  center?: [number, number];
  absolute?: boolean;
}

// Web fallback for PieChart using SVG
export const PieChart: React.FC<PieChartProps> = ({ 
  data, 
  width, 
  height, 
  chartConfig,
  ...props 
}) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.noDataText}>No data to display</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);
  let currentAngle = 0;
  const radius = Math.min(width, height) / 3;
  const centerX = width / 2;
  const centerY = height / 2 - 20; // Adjust for legend space

  const createPathData = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    
    return [
      "M", centerX, centerY,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ");
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <svg width={width} height={height - 60} style={{ marginBottom: 10 }}>
        {data.map((item, index) => {
          const angle = (item.count / total) * 360;
          const pathData = createPathData(currentAngle, currentAngle + angle);
          const path = <path key={index} d={pathData} fill={item.color} />;
          currentAngle += angle;
          return path;
        })}
      </svg>
      
      <View style={styles.legend}>
        {data.map((item, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: item.color }]} />
            <Text style={[styles.legendText, { color: item.legendFontColor, fontSize: item.legendFontSize }]}>
              {item.name} ({item.count})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 4,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
  },
});