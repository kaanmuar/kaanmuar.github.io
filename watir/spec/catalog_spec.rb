require "fileutils"
require "json"
require "watir"

ROOT = File.expand_path("../..", __dir__)
BASE = (ENV["BASE_URL"] || "http://127.0.0.1:8765").chomp("/")
LABEL = ENV["TARGET_BROWSER"] || "chrome"
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RUN_CHECK = File.read(File.join(ROOT, "tests", "native", "run-check.js"))
PRIME = "sessionStorage.setItem('hasSeenTour','true');" \
        "sessionStorage.setItem('hasSeenStudioTour','true');" \
        "sessionStorage.setItem('hasSeenLabTour','true');" \
        "localStorage.setItem('qa-lab-fw-asked','1');" \
        "localStorage.setItem('theme','light');"
WANTED = ENV.fetch("CATALOG_IDS", "").split(",").map(&:strip).reject(&:empty?)
ROWS = JSON.parse(File.read(File.join(ROOT, "tests", "native", "catalog.json")))
           .reject { |row| row["layer"] == "Performance" }
           .select { |row| WANTED.empty? || WANTED.include?(row["id"]) }
RESULTS = []

def open_browser
  if LABEL.casecmp?("firefox")
    Watir::Browser.new(:firefox, headless: true)
  else
    options = { args: ["--headless=new", "--disable-gpu", "--lang=en-US", "--window-size=1280,800"] }
    options[:binary] = MAC_CHROME if File.exist?(MAC_CHROME)
    Watir::Browser.new(:chrome, options: options)
  end
end

def screen(browser, phone)
  driver = browser.driver
  if driver.respond_to?(:execute_cdp)
    if phone
      driver.execute_cdp("Emulation.setDeviceMetricsOverride", width: 390, height: 844, deviceScaleFactor: 1, mobile: true)
    else
      driver.execute_cdp("Emulation.clearDeviceMetricsOverride")
    end
  end
  phone ? browser.window.resize_to(390, 844) : browser.window.resize_to(1280, 800)
end

RSpec.describe "Watir · CV regression lab catalog" do
  before(:all) do
    @browser = open_browser
    @browser.driver.manage.timeouts.page_load = 20
    @browser.driver.manage.timeouts.script = 120
  end

  after(:all) do
    @browser&.close
    FileUtils.mkdir_p(File.join(ROOT, "runner-results"))
    File.write(File.join(ROOT, "runner-results", "Watir.json"), JSON.pretty_generate({ framework: "Watir", cases: RESULTS }))
  end

  ROWS.each do |row|
    it "#{row["id"]} #{row["title"]}" do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      message =
        begin
          screen(@browser, row["phone"])
          @browser.goto("#{BASE}/#{row["path"]}")
          @browser.execute_script(PRIME)
          @browser.refresh
          @browser.driver.execute_async_script(RUN_CHECK, "#{BASE}/js/catalog-checks.js", row["id"]).to_s
        rescue StandardError => e
          "FAIL: #{e.message.lines.first.to_s.strip}"
        end
      failed = message.start_with?("FAIL:")
      RESULTS << {
        title: "#{LABEL} · #{row["id"]} #{row["title"]}",
        ok: !failed,
        ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round,
        error: failed ? message.delete_prefix("FAIL:").strip : ""
      }
      expect(failed).to be(false), message
    end
  end
end
