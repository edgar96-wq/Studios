# The web page calls these methods by name.
-keepclassmembers class com.crewstudio.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
