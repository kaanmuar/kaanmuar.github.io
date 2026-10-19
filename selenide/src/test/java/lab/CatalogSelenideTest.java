package lab;

import static com.codeborne.selenide.Selenide.executeAsyncJavaScript;
import static com.codeborne.selenide.Selenide.executeJavaScript;
import static com.codeborne.selenide.Selenide.open;
import static com.codeborne.selenide.Selenide.refresh;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.codeborne.selenide.Configuration;
import com.codeborne.selenide.WebDriverRunner;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chromium.HasCdp;
import org.openqa.selenium.json.Json;

class CatalogSelenideTest {
  static final Path ROOT = Path.of("..").toAbsolutePath().normalize();
  static final String BASE = System.getenv().getOrDefault("BASE_URL", "http://127.0.0.1:8765").replaceAll("/$", "");
  static final String LABEL = System.getenv().getOrDefault("TARGET_BROWSER", "chrome");
  static final String PRIME = "sessionStorage.setItem('hasSeenTour','true');"
      + "sessionStorage.setItem('hasSeenStudioTour','true');"
      + "sessionStorage.setItem('hasSeenLabTour','true');"
      + "localStorage.setItem('qa-lab-fw-asked','1');"
      + "localStorage.setItem('theme','light');";
  static final List<Map<String, Object>> RESULTS = new ArrayList<>();
  static String runCheck;

  @BeforeAll
  static void setUp() throws Exception {
    runCheck = Files.readString(ROOT.resolve("tests/native/run-check.js"), StandardCharsets.UTF_8);
    Configuration.browser = "firefox".equalsIgnoreCase(LABEL) ? "firefox" : "chrome";
    Configuration.headless = true;
    Configuration.browserSize = "1280x800";
    Configuration.pageLoadTimeout = 20000;
    Configuration.timeout = 8000;
    Path mac = Path.of("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    if ("chrome".equals(Configuration.browser) && Files.exists(mac)) Configuration.browserBinary = mac.toString();
  }

  @AfterAll
  static void tearDown() throws Exception {
    WebDriverRunner.closeWebDriver();
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("framework", "Selenide");
    summary.put("cases", RESULTS);
    Files.createDirectories(ROOT.resolve("runner-results"));
    Files.writeString(ROOT.resolve("runner-results/Selenide.json"), new Json().toJson(summary));
  }

  static void screen(boolean phone) {
    WebDriver driver = WebDriverRunner.getWebDriver();
    if (driver instanceof HasCdp) {
      HasCdp cdp = (HasCdp) driver;
      if (phone) cdp.executeCdpCommand("Emulation.setDeviceMetricsOverride", Map.of("width", 390, "height", 844, "deviceScaleFactor", 1, "mobile", true));
      else cdp.executeCdpCommand("Emulation.clearDeviceMetricsOverride", Map.of());
    }
    driver.manage().window().setSize(phone ? new Dimension(390, 844) : new Dimension(1280, 800));
  }

  static void runCase(Map<String, Object> row) {
    String id = String.valueOf(row.get("id"));
    long started = System.currentTimeMillis();
    String message;
    try {
      open(BASE + "/" + row.get("path"));
      screen(Boolean.TRUE.equals(row.get("phone")));
      executeJavaScript(PRIME);
      refresh();
      message = String.valueOf((Object) executeAsyncJavaScript(runCheck, BASE + "/js/catalog-checks.js", id));
    } catch (RuntimeException err) {
      message = "FAIL: " + String.valueOf(err.getMessage()).split("\n")[0];
    }
    boolean failed = message.startsWith("FAIL:");
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("title", LABEL + " · " + id + " " + row.get("title"));
    result.put("ok", !failed);
    result.put("ms", System.currentTimeMillis() - started);
    result.put("error", failed ? message.substring(5).trim() : "");
    RESULTS.add(result);
    assertFalse(failed, id + " " + message);
  }

  @TestFactory
  Stream<DynamicTest> catalog() throws Exception {
    Set<String> wanted = Arrays.stream(System.getenv().getOrDefault("CATALOG_IDS", "").split(","))
        .map(String::trim).filter(id -> !id.isEmpty()).collect(Collectors.toSet());
    List<Map<String, Object>> rows = new Json().toType(Files.readString(ROOT.resolve("tests/native/catalog.json")), Json.LIST_OF_MAPS_TYPE);
    return rows.stream()
        .filter(row -> !"Performance".equals(row.get("layer")))
        .filter(row -> wanted.isEmpty() || wanted.contains(row.get("id")))
        .map(row -> DynamicTest.dynamicTest(row.get("id") + " " + row.get("title"), () -> runCase(row)));
  }
}
