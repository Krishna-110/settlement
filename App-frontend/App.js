import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { LayoutDashboard, PlusCircle, HandCoins, Users, UserCircle } from 'lucide-react-native';
import { Theme } from './src/theme/Theme';
import * as Linking from 'expo-linking';
import { useStore } from './src/store/useStore';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Screens
import LandingScreen from './src/screens/LandingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AddDebtScreen from './src/screens/AddDebtScreen';
import SettlementScreen from './src/screens/SettlementScreen';
import ManagePersonsScreen from './src/screens/ManagePersonsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AccountScreen from './src/screens/AccountScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const debts = useStore((s) => s.debts);
  const user = useStore((s) => s.user);

  // How many debts are waiting for THIS user to confirm.
  const pendingConfirmations = debts.filter(
    (d) => d.status === 'UNCONFIRMED' && d.debtor?.phoneNumber === user?.phoneNumber
  ).length;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Dashboard') return <LayoutDashboard size={size} color={color} />;
          if (route.name === 'Record') return <PlusCircle size={size} color={color} />;
          if (route.name === 'Settlements') return <HandCoins size={size} color={color} />;
          if (route.name === 'Persons') return <Users size={size} color={color} />;
          if (route.name === 'Account') return <UserCircle size={size} color={color} />;
        },
        tabBarActiveTintColor: Theme.colors.primary,
        tabBarInactiveTintColor: Theme.colors.textSecondary,
        tabBarStyle: {
          height: 65 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 10,
          backgroundColor: Theme.colors.white,
          borderTopWidth: 1,
          borderTopColor: Theme.colors.border,
          ...Theme.shadow.medium,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarBadge: pendingConfirmations > 0 ? pendingConfirmations : undefined }}
      />
      <Tab.Screen name="Record" component={AddDebtScreen} />
      <Tab.Screen name="Settlements" component={SettlementScreen} />
      <Tab.Screen name="Persons" component={ManagePersonsScreen} options={{ tabBarLabel: 'Circle' }} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={Theme.colors.primary} />
  </View>
);

export default function App() {
  const {
    setAuthenticated, checkAuth, isAuthenticated,
    pendingJoinCode, setPendingJoinCode, joinGroup,
  } = useStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 1. Initial Auth Check and initialization
    const init = async () => {
      await checkAuth();
      setIsReady(true);
    };
    init();

    // 2. Handle incoming deep links: the OAuth2 redirect, and group invites.
    const handleDeepLink = (event) => {
      const { url } = event;
      if (!url) return;
      try {
        const { queryParams } = Linking.parse(url);

        // cleardues://--/login-success?token=...
        if (queryParams && queryParams.token) {
          setAuthenticated(queryParams.token);
          return;
        }

        // settlement://join?code=ABC123 - stash it; joining needs a signed-in user, and the
        // link often arrives before login (or with the app closed entirely).
        if (queryParams && queryParams.code) {
          setPendingJoinCode(String(queryParams.code).trim().toUpperCase());
        }
      } catch (error) {
        console.error('Deep link parse error', error);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check for initial URL if app was closed
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 3. Once signed in, redeem any invite code that came in from a deep link.
  useEffect(() => {
    if (!isAuthenticated || !pendingJoinCode) return;
    let cancelled = false;

    (async () => {
      try {
        const group = await joinGroup(pendingJoinCode);
        if (!cancelled) {
          Alert.alert('Group joined', `You're now a member of "${group?.name || 'the group'}".`);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            'Could not join group',
            err.response?.data?.message || 'That invite code is not valid anymore.'
          );
        }
      } finally {
        if (!cancelled) setPendingJoinCode(null);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, pendingJoinCode]);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="History" component={HistoryScreen} />
            </>
          ) : (
            <Stack.Screen name="Landing" component={LandingScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
  },
});
