import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, ROUNDED } from '../theme';
import { GEOAPIFY_AUTOCOMPLETE_URL, TOLEDO_SEARCH_BIAS, haversineDistance, normalizeGeoapifyFeature, toCoordinate } from '../config/mapConfig';
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
  onPinOnMap,
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
  const [showNoResults, setShowNoResults] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

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
      setShowNoResults(false);
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

    // Never leave the previous query's results on screen while the new
    // request is running. Local matches can stay visible immediately.
    setSuggestions(localMatches.slice(0, 8));
    setShowDropdown(localMatches.length > 0);
    setShowNoResults(false);

    // 2. Fetch Geoapify twice in parallel:
    //    - the normal address/street autocomplete
    //    - amenity/POI autocomplete for beaches, hotels, resorts, restaurants
    // 400 ms debounce + AbortController: requests for an older keystroke can
    // never overwrite the suggestions for the current one.
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        // Normalize abbreviations like "brgy" or "bgy" for geocoder
        const normalizedText = trimmed
          .replace(/\bbrgy\.?\b/gi, 'Barangay ')
          .replace(/\bbgy\.?\b/gi, 'Barangay ');

        const requestPlaces = async (extraParams = {}) => {
          const params = new URLSearchParams({
            text: normalizedText,
            bias: `proximity:${TOLEDO_SEARCH_BIAS.longitude},${TOLEDO_SEARCH_BIAS.latitude}`,
            filter: `circle:${TOLEDO_SEARCH_BIAS.longitude},${TOLEDO_SEARCH_BIAS.latitude},${TOLEDO_SEARCH_BIAS.radiusMeters}`,
            countrycode: 'ph',
            limit: '8',
            apiKey: GEOAPIFY_API_KEY,
            ...extraParams,
          });
          const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params}`, {
            signal: controller.signal,
          });
          if (!res.ok) return [];
          const data = await res.json();
          if (!Array.isArray(data?.features)) return [];
          return data.features
            .map(normalizeGeoapifyFeature)
            .filter(Boolean)
            .map((place) => ({
              id:
                place.placeId ||
                `${place.coordinate.latitude}-${place.coordinate.longitude}-${place.formatted}`,
              ...place,
              isLocal: false,
            }));
        };

        const [addressResult, poiResult] = await Promise.allSettled([
          requestPlaces(),
          requestPlaces({ type: 'amenity' }),
        ]);
        if (controller.signal.aborted) return;

        const addressItems =
          addressResult.status === 'fulfilled' ? addressResult.value : [];
        const poiItems = poiResult.status === 'fulfilled' ? poiResult.value : [];
        const apiItems = [...addressItems, ...poiItems];

        const queryText = normalizedText.trim().toLowerCase();
        const queryWordCount = queryText.split(/\s+/).filter(Boolean).length;
        const rankFor = (item) => {
          const title = String(item.title || item.formatted || '')
            .trim()
            .toLowerCase();
          if (!queryText) return 3;
          if (title === queryText) return 0;
          if (title.startsWith(queryText)) return 1;
          if (title.includes(queryText)) return 2;
          return 3;
        };
        const distanceFor = (item) =>
          haversineDistance(
            TOLEDO_SEARCH_BIAS.latitude,
            TOLEDO_SEARCH_BIAS.longitude,
            item.coordinate.latitude,
            item.coordinate.longitude
          );

        // A one-word query is usually a category ("beach", "hotel") or a
        // barangay, so the nearest matches are the most useful. For a full
        // place name ("Days Hotel"), exact/prefix name matches come first.
        const preferDistance = queryWordCount <= 1;
        apiItems.sort((a, b) => {
          if (!preferDistance) {
            const rankDiff = rankFor(a) - rankFor(b);
            if (rankDiff !== 0) return rankDiff;
          }
          return distanceFor(a) - distanceFor(b);
        });

        const titleKey = (item) =>
          String(item.title || item.formatted || '').trim().toLowerCase();
        const apiTitleKeys = new Set(
          apiItems.map(titleKey).filter(Boolean)
        );
        const localOnly = localMatches.filter(
          (item) => !apiTitleKeys.has(titleKey(item))
        );

        // Deduplicate by Geoapify place id first, then by coordinate. Same-name
        // records that are very close together are duplicate OSM entries; the
        // same name at a genuinely different location is kept.
        const merged = [];
        const seenPlaceIds = new Set();
        const seenCoords = new Set();
        const seenTitlePoints = [];
        [...localOnly, ...apiItems].forEach((item) => {
          if (!item?.coordinate) return;
          const placeKey = item.placeId ? String(item.placeId) : null;
          if (placeKey && seenPlaceIds.has(placeKey)) return;
          if (placeKey) seenPlaceIds.add(placeKey);
          const coordKey = `${item.coordinate.latitude.toFixed(
            5
          )},${item.coordinate.longitude.toFixed(5)}`;
          if (seenCoords.has(coordKey)) return;

          const title = titleKey(item);
          const isNearDuplicate =
            Boolean(title) &&
            seenTitlePoints.some(
              (entry) =>
                entry.title === title &&
                haversineDistance(
                  entry.latitude,
                  entry.longitude,
                  item.coordinate.latitude,
                  item.coordinate.longitude
                ) *
                  1000 <
                  250
            );
          if (isNearDuplicate) return;

          seenCoords.add(coordKey);
          if (title) {
            seenTitlePoints.push({
              title,
              latitude: item.coordinate.latitude,
              longitude: item.coordinate.longitude,
            });
          }
          merged.push(item);
        });

        const finalSuggestions = merged.slice(0, 8);
        setSuggestions(finalSuggestions);
        setShowNoResults(finalSuggestions.length === 0);
        setShowDropdown(true);
      } catch (e) {
        if (e?.name === 'AbortError' || controller.signal.aborted) return;
        // In case of network error, keep local matches and offer the map pin
        // fallback instead of leaving stale results on screen.
        setSuggestions(localMatches.slice(0, 8));
        setShowNoResults(localMatches.length === 0);
        setShowDropdown(true);
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
    setShowNoResults(false);
    setLoading(false);
    onChangeText?.('');
  };

  const handlePinOnMap = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const text = query.trim();
    setSuggestions([]);
    setShowDropdown(false);
    setShowNoResults(false);
    setLoading(false);
    inputRef.current?.blur?.();
    onPinOnMap?.(text);
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
    setShowNoResults(false);
    onSelect?.({ text: formatted, ...place });
  };

  const getItemIcon = (item) => {
    const title = String(item.title || '').toLowerCase();
    if (item.category === 'beach' || title.includes('beach')) {
      return 'beach-access';
    }
    if (
      item.category === 'accommodation' ||
      title.includes('hotel') ||
      title.includes('resort') ||
      title.includes('pension') ||
      title.includes('inn')
    ) {
      return 'hotel';
    }
    if (
      item.category === 'catering' ||
      title.includes('restaurant') ||
      title.includes('cafe') ||
      title.includes('coffee')
    ) {
      return 'restaurant';
    }
    if (item.category === 'tourism') return 'attractions';
    if (item.category === 'leisure') return 'park';
    if (item.category === 'entertainment') return 'local-activity';
    if (item.category === 'healthcare' || item.category === 'hospital') {
      return 'local-hospital';
    }
    if (item.category === 'education' || item.category === 'school') {
      return 'school';
    }
    if (item.category === 'commercial' || item.category === 'shopping') {
      return 'shopping-bag';
    }
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
          ref={inputRef}
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

      {showDropdown && (suggestions.length > 0 || showNoResults) && (
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

          {showNoResults ? (
            <View style={styles.noResultsRow}>
              <Text style={styles.noResultsText}>
                No matching address or place found.
              </Text>
            </View>
          ) : null}

          {onPinOnMap ? (
            <TouchableOpacity
              style={styles.pinOnMapItem}
              onPress={handlePinOnMap}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, styles.pinOnMapIconCircle]}>
                <MaterialIcons
                  name="add-location-alt"
                  size={18}
                  color="#b45309"
                />
              </View>
              <View style={styles.textColumn}>
                <Text style={styles.pinOnMapTitle}>
                  {"Can't find it? Pin it on the map"}
                </Text>
                <Text style={styles.noResultsText} numberOfLines={2}>
                  {showNoResults
                    ? 'Tap the exact spot for this place'
                    : 'Choose the exact spot on the map'}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}
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
  pinOnMapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  pinOnMapIconCircle: {
    backgroundColor: '#fef3c7',
  },
  pinOnMapTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 2,
  },
  noResultsRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  noResultsText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
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
