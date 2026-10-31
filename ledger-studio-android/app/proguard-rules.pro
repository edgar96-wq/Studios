# The web page calls these methods by name.
-keepclassmembers class com.ledgerstudio.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
