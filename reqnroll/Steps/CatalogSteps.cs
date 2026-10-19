using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using NUnit.Framework;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Firefox;
using Reqnroll;

namespace CatalogLab.Steps
{
    [Binding]
    public class CatalogSteps
    {
        const string Prime = "sessionStorage.setItem('hasSeenTour','true');"
            + "sessionStorage.setItem('hasSeenStudioTour','true');"
            + "sessionStorage.setItem('hasSeenLabTour','true');"
            + "localStorage.setItem('qa-lab-fw-asked','1');"
            + "localStorage.setItem('theme','light');";

        static readonly string Root = FindRoot();
        static readonly string Base = (Environment.GetEnvironmentVariable("BASE_URL") ?? "http://127.0.0.1:8765").TrimEnd('/');
        static readonly string Label = Environment.GetEnvironmentVariable("TARGET_BROWSER") ?? "chrome";
        static readonly List<Dictionary<string, object>> Results = new List<Dictionary<string, object>>();
        static IWebDriver driver;
        static string runCheck;

        readonly ScenarioContext scenario;
        readonly Stopwatch watch = new Stopwatch();
        string message = "";

        public CatalogSteps(ScenarioContext scenario)
        {
            this.scenario = scenario;
        }

        static string FindRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "tests", "native", "catalog.json"))) dir = dir.Parent;
            return dir?.FullName ?? Directory.GetCurrentDirectory();
        }

        [BeforeTestRun]
        public static void Start()
        {
            runCheck = File.ReadAllText(Path.Combine(Root, "tests", "native", "run-check.js"));
            if (Label.Equals("firefox", StringComparison.OrdinalIgnoreCase))
            {
                var firefox = new FirefoxOptions();
                firefox.AddArgument("-headless");
                driver = new FirefoxDriver(firefox);
            }
            else
            {
                var options = new ChromeOptions();
                options.AddArguments("--headless=new", "--disable-gpu", "--lang=en-US", "--window-size=1280,800");
                const string mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
                if (File.Exists(mac)) options.BinaryLocation = mac;
                driver = new ChromeDriver(options);
            }
            driver.Manage().Timeouts().PageLoad = TimeSpan.FromSeconds(20);
            driver.Manage().Timeouts().AsynchronousJavaScript = TimeSpan.FromSeconds(120);
        }

        [AfterTestRun]
        public static void Stop()
        {
            driver?.Quit();
            Directory.CreateDirectory(Path.Combine(Root, "runner-results"));
            var summary = new Dictionary<string, object> { ["framework"] = "Reqnroll", ["cases"] = Results };
            File.WriteAllText(Path.Combine(Root, "runner-results", "Reqnroll.json"), JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true }));
        }

        [BeforeScenario]
        public void StartClock() => watch.Restart();

        [AfterScenario]
        public void Record()
        {
            var error = scenario.TestError;
            Results.Add(new Dictionary<string, object>
            {
                ["title"] = Label + " · " + scenario.ScenarioInfo.Title,
                ["ok"] = error == null,
                ["ms"] = watch.ElapsedMilliseconds,
                ["error"] = error == null ? "" : error.Message.Split('\n')[0]
            });
        }

        [Given(@"the page ""(.*)"" is open on a (desktop|phone) screen")]
        public void OpenPage(string page, string screen)
        {
            var phone = screen == "phone";
            if (driver is ChromeDriver chrome)
            {
                if (phone) chrome.ExecuteCdpCommand("Emulation.setDeviceMetricsOverride", new Dictionary<string, object> { ["width"] = 390, ["height"] = 844, ["deviceScaleFactor"] = 1, ["mobile"] = true });
                else chrome.ExecuteCdpCommand("Emulation.clearDeviceMetricsOverride", new Dictionary<string, object>());
            }
            driver.Manage().Window.Size = phone ? new System.Drawing.Size(390, 844) : new System.Drawing.Size(1280, 800);
            driver.Navigate().GoToUrl(Base + "/" + page);
            ((IJavaScriptExecutor)driver).ExecuteScript(Prime);
            driver.Navigate().Refresh();
        }

        [When(@"the catalog check ""(.*)"" runs")]
        public void RunCheck(string id)
        {
            message = Convert.ToString(((IJavaScriptExecutor)driver).ExecuteAsyncScript(runCheck, Base + "/js/catalog-checks.js", id)) ?? "";
        }

        [Then(@"the check passes")]
        public void CheckPasses()
        {
            Assert.That(message.StartsWith("FAIL:") ? message.Substring(5).Trim() : "", Is.Empty, message);
        }
    }
}
