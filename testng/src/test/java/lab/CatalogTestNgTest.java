package lab;

import static org.testng.Assert.assertFalse;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.chromium.HasCdp;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.json.Json;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

public class CatalogTestNgTest {
  static final Path ROOT = Path.of("..").toAbsolutePath().normalize();
  static final String BASE = System.getenv().getOrDefault("BASE_URL", "http://127.0.0.1:8765").replaceAll("/$", "");
  static final String LABEL = System.getenv().getOrDefault("TARGET_BROWSER", "chrome");
  static final String PRIME = "sessionStorage.setItem('hasSeenTour','true');"
      + "sessionStorage.setItem('hasSeenStudioTour','true');"
      + "sessionStorage.setItem('hasSeenLabTour','true');"
      + "localStorage.setItem('qa-lab-fw-asked','1');"
      + "localStorage.setItem('theme','light');";

  WebDriver driver;
  String runCheck;
  final List<Map<String, Object>> results = new ArrayList<>();

  @DataProvider(name = "catalog")
  public Object[][] catalog() throws Exception {
    Set<String> wanted = Arrays.stream(System.getenv().getOrDefault("CATALOG_IDS", "").split(","))
        .map(String::trim).filter(id -> !id.isEmpty()).collect(Collectors.toSet());
    List<Map<String, Object>> rows = new Json().toType(Files.readString(ROOT.resolve("tests/native/catalog.json")), Json.LIST_OF_MAPS_TYPE);
    return rows.stream()
        .filter(row -> !"Performance".equals(row.get("layer")))
        .filter(row -> wanted.isEmpty() || wanted.contains(row.get("id")))
        .map(row -> new Object[] {row.get("id"), row.get("title"), row.get("path"), Boolean.TRUE.equals(row.get("phone"))})
        .toArray(Object[][]::new);
  }

  @BeforeClass
  public void start() throws Exception {
    runCheck = Files.readString(ROOT.resolve("tests/native/run-check.js"), StandardCharsets.UTF_8);
    if ("firefox".equalsIgnoreCase(LABEL)) {
      driver = new FirefoxDriver(new FirefoxOptions().addArguments("-headless"));
    } else {
      ChromeOptions options = new ChromeOptions().addArguments("--headless=new", "--disable-gpu", "--lang=en-US", "--window-size=1280,800");
      Path mac = Path.of("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
      if (Files.exists(mac)) options.setBinary(mac.toString());
      driver = new ChromeDriver(options);
    }
    driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(20)).scriptTimeout(Duration.ofSeconds(120));
  }

  @AfterClass(alwaysRun = true)
  public void stop() throws Exception {
    if (driver != null) driver.quit();
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("framework", "TestNG");
    summary.put("cases", results);
    Files.createDirectories(ROOT.resolve("runner-results"));
    Files.writeString(ROOT.resolve("runner-results/TestNG.json"), new Json().toJson(summary));
  }

  void screen(boolean phone) {
    if (driver instanceof HasCdp) {
      HasCdp cdp = (HasCdp) driver;
      if (phone) cdp.executeCdpCommand("Emulation.setDeviceMetricsOverride", Map.of("width", 390, "height", 844, "deviceScaleFactor", 1, "mobile", true));
      else cdp.executeCdpCommand("Emulation.clearDeviceMetricsOverride", Map.of());
    }
    driver.manage().window().setSize(phone ? new Dimension(390, 844) : new Dimension(1280, 800));
  }

  @Test(dataProvider = "catalog")
  public void catalogCase(String id, String title, String page, boolean phone) {
    long started = System.currentTimeMillis();
    String message;
    try {
      screen(phone);
      driver.get(BASE + "/" + page);
      ((JavascriptExecutor) driver).executeScript(PRIME);
      driver.navigate().refresh();
      message = String.valueOf(((JavascriptExecutor) driver).executeAsyncScript(runCheck, BASE + "/js/catalog-checks.js", id));
    } catch (RuntimeException err) {
      message = "FAIL: " + err.getMessage().split("\n")[0];
    }
    boolean failed = message.startsWith("FAIL:");
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("title", LABEL + " · " + id + " " + title);
    row.put("ok", !failed);
    row.put("ms", System.currentTimeMillis() - started);
    row.put("error", failed ? message.substring(5).trim() : "");
    results.add(row);
    assertFalse(failed, id + " " + message);
  }
}
