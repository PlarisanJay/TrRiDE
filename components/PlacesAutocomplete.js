import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED } from '../theme';
import { GEOAPIFY_AUTOCOMPLETE_URL, TOLEDO_CITY } from '../config/mapConfig';

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

export default function PlacesAutocomplete({
  icon,
  iconColor,
  placeholder,
  value,
  onChangeText,
  onSelect,
  style,
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const fetchSuggestions = (text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          text,
          filter: 'rect:123.58,10.28,123.72,10.38',
          bias: `proximity:${TOLEDO_CITY.latitude},${TOLEDO_CITY.longitude}`,
          limit: '5',
          apiKey: GEOAPIFY_API_KEY,
        });
        const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params}`);
        const data = await res.json();
        if (data.features) {
          const items = data.features.map((f) => ({
            id: f.properties.place_id || f.properties.formatted,
            formatted: f.properties.formatted,
            lat: f.properties.lat,
            lon: f.properties.lon,
          }));
          setSuggestions(items);
          setShowDropdown(items.length > 0);
        }
      } catch (e) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleChange = (text) => {
    setQuery(text);
    onChangeText?.(text);
    fetchSuggestions(text);
  };

  const handleSelect = (item) => {
    setQuery(item.formatted);
    setShowDropdown(false);
    setSuggestions([]);
    onSelect?.({ text: item.formatted, latitude: item.lat, longitude: item.lon });
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputContainer}>
        {icon && <MaterialIcons name={icon} size={20} color={iconColor} style={styles.inputIcon} />}
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="rgba(115, 118, 134, 0.5)"
          value={query}
          onChangeText={handleChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        />
        {loading && <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />}
      </View>
      {showDropdown && suggestions.length > 0 && (
        <ScrollView
          style={styles.dropdown}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {suggestions.map((item) => (
            <TouchableOpacity key={item.id} style={styles.suggestionItem} onPress={() => handleSelect(item)} activeOpacity={0.7}>
              <MaterialIcons name="location-on" size={16} color={COLORS.outline} />
              <Text style={styles.suggestionText} numberOfLines={2}>{item.formatted}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.surfaceContainerLowest,
    height: 48,
    paddingHorizontal: SPACING.sm,
  },
  inputIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: COLORS.onSurface,
  },
  loader: {
    marginLeft: 6,
  },
  dropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderTopWidth: 0,
    borderBottomLeftRadius: ROUNDED.md,
    borderBottomRightRadius: ROUNDED.md,
    maxHeight: 200,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
    marginTop: -1,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    gap: SPACING.sm,
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.onSurface,
  },
});
