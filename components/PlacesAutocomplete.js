import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, ROUNDED } from '../theme';
import { GEOAPIFY_AUTOCOMPLETE_URL, TOLEDO_SEARCH_BIAS, normalizeGeoapifyFeature, toCoordinate } from '../config/mapConfig';
import { searchToledoLocations } from '../data/toledoLocations';

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

export default function PlacesAutocomplete({
  icon,
  iconColor,
  customIcon,
  placeholder,
  value,
  onChangeText,
  onSelect,
  onFocus,
  onBlur,
  style,
  borderless = false,
  inputContainerStyle,
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const toLocalSuggestion = (item) => {
    const coordinate = toCoordinate({ latitude: item.lat, longitude: item.lon });
    if (!coordinate) return null;
    return {
      id: item.id,
      placeId: null,
      formatted: item.formatted || item.title || item.name,
      title: item.title || item.name,
      subtext: item.subtext,
      category: item.category,
      isLocal: true,
      coordinate,
    };
  };

  const fetchSuggestions = (text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    const trimmed = text.trim();

    // 1. Instant match against Toledo City barangays & landmarks.
    // These are hand-maintained centroids, so they are a fallback only:
    // when Geoapify returns a place with the same title we prefer the API's
    // own lat/lon below.
    const localMatches = searchToledoLocations(trimmed)
      .map(toLocalSuggestion)
      .filter(Boolean);
    if (localMatches.length > 0) {
      setSuggestions(localMatches);
      setShowDropdown(true);
    }

    // 2. Fetch Geoapify for supplementary/street-level addresses.
    // 400 ms debounce + AbortController: the request for an older keystroke
    // can never overwrite the suggestions for the current one.
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        // Normalize abbreviations like "brgy" or "bgy" for geocoder
        const normalizedText = trimmed
          .replace(/\bbrgy\.?\b/gi, 'Barangay ')
          .replace(/\bbgy\.?\b/gi, 'Barangay ');

        const params = new URLSearchParams({
          text: normalizedText,
          bias: `proximity:${TOLEDO_SEARCH_BIAS.longitude},${TOLEDO_SEARCH_BIAS.latitude}`,
          filter: `circle:${TOLEDO_SEARCH_BIAS.longitude},${TOLEDO_SEARCH_BIAS.latitude},${TOLEDO_SEARCH_BIAS.radiusMeters}`,
          countrycode: 'ph',
          limit: '6',
          apiKey: GEOAPIFY_API_KEY,
        });

        const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;

        if (data.features && Array.isArray(data.features)) {
          const apiItems = data.features
            .map(normalizeGeoapifyFeature)
            .filter(Boolean)
            .map((place) => ({
              id: place.placeId || `${place.coordinate.latitude}-${place.coordinate.longitude}-${place.formatted}`,
              ...place,
              isLocal: false,
            }));

          // Merge by normalized title, then by coordinate. API results are
          // written last so a precise Geoapify coordinate replaces a local
          // centroid with the same name.
          const byTitle = new Map();
          const keyFor = (item) =>
            String(item.title || item.formatted || '').trim().toLowerCase();
          [...localMatches, ...apiItems].forEach((item) => {
            const key = keyFor(item);
            if (!key) return;
            byTitle.set(key, item);
          });

          const deduped = [];
          const seenCoords = new Set();
          for (const item of byTitle.values()) {
            const coordKey = `${item.coordinate.latitude.toFixed(5)},${item.coordinate.longitude.toFixed(5)}`;
            if (seenCoords.has(coordKey)) continue;
            seenCoords.add(coordKey);
            deduped.push(item);
          }

          setSuggestions(deduped.slice(0, 8));
          setShowDropdown(deduped.length > 0);
        } else if (localMatches.length > 0) {
          setSuggestions(localMatches);
          setShowDropdown(true);
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
        // In case of network error, keep local matches
        if (localMatches.length > 0) {
          setSuggestions(localMatches);
          setShowDropdown(true);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    }, 400);
  };

  const handleChange = (text) => {
    setQuery(text);
    onChangeText?.(text);
    fetchSuggestions(text);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    setLoading(false);
    onChangeText?.('');
  };

  const handleSelect = (item) => {
    // The suggestion already carries the exact coordinate returned by the
    // API. Never reverse geocode the display text here, and never fall back
    // to a centroid: if there is no coordinate, the item is not selectable.
    const coordinate = toCoordinate(item.coordinate);
    if (!coordinate) return;
    const formatted =
      item.formatted ||
      (item.title ? `${item.title}${item.subtext ? ', ' + item.subtext : ''}` : '');
    const place = {
      placeId: item.placeId || null,
      formatted,
      coordinate,
    };
    setQuery(formatted);
    setShowDropdown(false);
    setSuggestions([]);
    onSelect?.({ text: formatted, ...place });
  };

  const getItemIcon = (item) => {
    if (item.category === 'school') return 'school';
    if (item.category === 'shopping') return 'shopping-bag';
    if (item.category === 'hospital') return 'local-hospital';
    if (item.category === 'transport') return 'directions-boat';
    if (item.category === 'civic') return 'account-balance';
    return 'location-on';
  };

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.inputContainer,
          borderless && styles.borderlessContainer,
          inputContainerStyle,
        ]}
      >
        {customIcon ? (
          customIcon
        ) : icon ? (
          <MaterialIcons name={icon} size={20} color={iconColor} style={styles.inputIcon} />
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={handleChange}
          onFocus={() => {
            onFocus?.();
            if (suggestions.length > 0 || query.length >= 2) {
              fetchSuggestions(query);
            }
          }}
          onBlur={onBlur}
          autoCorrect={false}
          returnKeyType="search"
        />

        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
        ) : query.length > 0 ? (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={18} color="#94a3b8" style={styles.clearIcon} />
          </TouchableOpacity>
        ) : null}
      </View>

      {showDropdown && suggestions.length > 0 && (
        <ScrollView
          style={styles.dropdown}
          contentContainerStyle={styles.dropdownContent}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={true}
        >
          {suggestions.map((item, index) => (
            <TouchableOpacity
              key={item.id || `${item.coordinate.latitude}-${item.coordinate.longitude}-${index}`}
              style={styles.suggestionItem}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <MaterialIcons name={getItemIcon(item)} size={18} color="#2563eb" />
              </View>
              <View style={styles.textColumn}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {item.title || item.formatted}
                </Text>
                {item.subtext ? (
                  <Text style={styles.suggestionSubtext} numberOfLines={1}>
                    {item.subtext}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: ROUNDED.md,
    backgroundColor: '#ffffff',
    height: 48,
    paddingHorizontal: SPACING.sm,
  },
  borderlessContainer: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    height: '100%',
  },
  inputIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '500',
    color: '#0f172a',
    paddingVertical: 0,
  },
  clearIcon: {
    paddingHorizontal: 4,
  },
  loader: {
    marginLeft: 6,
  },
  dropdown: {
    position: 'absolute',
    top: 48,
    left: -58,
    right: -14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    maxHeight: 220,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 25,
    zIndex: 99999,
  },
  dropdownContent: {
    paddingVertical: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  suggestionSubtext: {
    fontSize: 12,
    color: '#64748b',
  },
});
