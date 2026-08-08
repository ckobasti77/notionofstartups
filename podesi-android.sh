#!/usr/bin/env bash
# Podesi okruzenje i pokreni Android build -- sve u ISTOM procesu.
#
#   bash podesi-android.sh
#
# Kljucno: React Native trazi JDK 17. JDK koji nosi Android Studio Quail je 25
# i na njemu puca `configureCMakeDebug` (JVM ispise "restricted method"
# upozorenje na stderr, a AGP to tretira kao gresku).

set -u
KOREN="$(cd "$(dirname "$0")" && pwd)"

major_verzija() {  # $1 = folder JDK-a -> ispise npr. 17
  "$1/bin/java.exe" -version 2>&1 | head -1 \
    | sed -E 's/.*"([0-9]+).*/\1/'
}

echo "=================================================="
echo " 1/7  Trazim JDK 17 (ili 21)"
echo "=================================================="

JDK=""
for obrazac in \
  "/c/Program Files/Microsoft/jdk-17"* \
  "/c/Program Files/Eclipse Adoptium/jdk-17"* \
  "/c/Program Files/Java/jdk-17"* \
  "/c/Program Files/Zulu/zulu-17"* \
  "/c/Program Files/Amazon Corretto/jdk17"* \
  "/c/Program Files/Microsoft/jdk-21"* \
  "/c/Program Files/Eclipse Adoptium/jdk-21"* \
  "/c/Program Files/Java/jdk-21"*
do
  if [ -x "$obrazac/bin/java.exe" ]; then JDK="$obrazac"; break; fi
done

if [ -z "$JDK" ]; then
  cat <<'PORUKA'
NEMAS JDK 17 NA RACUNARU.

Java koju nosi Android Studio je verzija 25 -- na njoj React Native build
puca na koraku configureCMakeDebug. To nije zaobilazno podesavanjem.

Instaliraj JDK 17 (jednom, ~180 MB) u PowerShell-u:

    winget install Microsoft.OpenJDK.17

Ako winget ne radi, skini MSI rucno:
    https://learn.microsoft.com/java/openjdk/download

Kad zavrsi, pusti ovu skriptu ponovo -- nadje ga sama.
PORUKA
  exit 1
fi

VER="$(major_verzija "$JDK")"
echo "Nasao: $JDK  (Java $VER)"
if [ "$VER" -ge 24 ] 2>/dev/null; then
  echo "GRESKA: ovo je Java $VER, a treba 17 ili 21. Vidi poruku iznad."
  exit 1
fi

export JAVA_HOME="$(cd "$JDK" && pwd -W 2>/dev/null || echo "$JDK")"
export PATH="$JDK/bin:$PATH"

echo
echo "=================================================="
echo " 2/7  Provera Jave"
echo "=================================================="
echo "JAVA_HOME=$JAVA_HOME"
java -version 2>&1 || exit 1

echo
echo "=================================================="
echo " 3/7  Android SDK"
echo "=================================================="
SDK="$HOME/AppData/Local/Android/Sdk"
if [ -d "$SDK" ]; then
  export ANDROID_HOME="$(cd "$SDK" && pwd -W 2>/dev/null || echo "$SDK")"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$SDK/platform-tools:$SDK/emulator:$PATH"
  echo "ANDROID_HOME=$ANDROID_HOME"
else
  echo "UPOZORENJE: nema foldera $SDK"
fi

echo
echo "=================================================="
echo " 4/7  Otpornost Gradle-a na losu mrezu"
echo "=================================================="
GP="$HOME/.gradle/gradle.properties"
mkdir -p "$HOME/.gradle"; touch "$GP"
if grep -q "DEVOTION-MREZA" "$GP" 2>/dev/null; then
  echo "Vec podeseno u $GP"
else
  cat >> "$GP" <<'PROPS'

# --- DEVOTION-MREZA: ponovni pokusaji kad veza prekine TLS handshake ---
systemProp.org.gradle.internal.repository.max.retries=10
systemProp.org.gradle.internal.repository.initial.backoff=1000
systemProp.org.gradle.internal.http.connectionTimeout=180000
systemProp.org.gradle.internal.http.socketTimeout=180000
org.gradle.workers.max=2
org.gradle.parallel=false
PROPS
  echo "Dopisano u $GP"
fi

echo
echo "=================================================="
echo " 5/7  Gasim stare Gradle demone"
echo "=================================================="
# Demon pokrenut pod Javom 25 bi se inace ponovo iskoristio.
if [ -x "$KOREN/apps/mobile/android/gradlew.bat" ]; then
  (cd "$KOREN/apps/mobile/android" && ./gradlew.bat --stop) || true
else
  echo "Nema jos android/ foldera, preskacem."
fi

echo
echo "=================================================="
echo " 6/7  Povezani uredjaji"
echo "=================================================="
if command -v adb >/dev/null 2>&1; then
  adb devices
  if ! adb devices | grep -q "device$"; then
    echo; echo "NEMA UPALJENOG UREDJAJA. Upali emulator pa pusti ponovo."
    exit 1
  fi
else
  echo "adb nije u PATH-u; nastavljam svejedno."
fi

echo
echo "=================================================="
echo " 7/7  Build"
echo "=================================================="
cd "$KOREN/apps/mobile" || exit 1
npx expo run:android
