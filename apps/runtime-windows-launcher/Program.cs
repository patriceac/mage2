using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Mage2.WindowsPlayerLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    internal sealed class LauncherForm : Form
    {
        private const string RuntimeDirectoryName = "runtime";
        private const string RuntimeExecutableName = "MAGE2 Player.exe";
        private readonly string projectName;
        private readonly System.Windows.Forms.Timer animationTimer;
        private Process runtimeProcess;
        private bool runtimeStartQueued;
        private bool handoffComplete;
        private int animationFrame;

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr windowHandle);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr windowHandle);

        internal LauncherForm()
        {
            projectName = ReadProjectName();
            Text = projectName;
            AccessibleName = projectName + " player startup";
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(5, 8, 11);
            ForeColor = Color.FromArgb(244, 248, 251);
            FormBorderStyle = FormBorderStyle.None;
            KeyPreview = true;
            ShowInTaskbar = true;
            StartPosition = FormStartPosition.Manual;
            WindowState = FormWindowState.Maximized;
            TopMost = true;
            DoubleBuffered = true;

            animationTimer = new System.Windows.Forms.Timer();
            animationTimer.Interval = 40;
            animationTimer.Tick += delegate
            {
                animationFrame = (animationFrame + 1) % 120;
                Invalidate(ResolveProgressRectangle());
            };
            animationTimer.Start();

            KeyDown += delegate(object sender, KeyEventArgs eventArgs)
            {
                if (eventArgs.KeyCode == Keys.Escape)
                {
                    Close();
                }
            };
        }

        protected override void OnPaint(PaintEventArgs eventArgs)
        {
            base.OnPaint(eventArgs);
            Graphics graphics = eventArgs.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            using (LinearGradientBrush background = new LinearGradientBrush(
                ClientRectangle,
                Color.FromArgb(5, 8, 11),
                Color.FromArgb(7, 22, 31),
                32f))
            {
                graphics.FillRectangle(background, eventArgs.ClipRectangle);
            }

            float centerY = ClientSize.Height * 0.48f;
            RectangleF brandRectangle = new RectangleF(48f, centerY - 66f, ClientSize.Width - 96f, 30f);
            RectangleF projectRectangle = new RectangleF(48f, centerY - 30f, ClientSize.Width - 96f, 62f);
            using (StringFormat centered = new StringFormat())
            using (Font brandFont = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point))
            using (Font projectFont = new Font("Segoe UI Semibold", 30f, FontStyle.Bold, GraphicsUnit.Point))
            using (Brush brandBrush = new SolidBrush(Color.FromArgb(101, 216, 255)))
            using (Brush projectBrush = new SolidBrush(Color.FromArgb(244, 248, 251)))
            {
                centered.Alignment = StringAlignment.Center;
                centered.LineAlignment = StringAlignment.Center;
                centered.Trimming = StringTrimming.EllipsisCharacter;
                graphics.DrawString("MAGE2 PLAYER", brandFont, brandBrush, brandRectangle, centered);
                graphics.DrawString(projectName, projectFont, projectBrush, projectRectangle, centered);
            }

            Rectangle track = ResolveProgressRectangle();
            using (GraphicsPath trackPath = RoundedRectangle(track, 3))
            using (Brush trackBrush = new SolidBrush(Color.FromArgb(45, 255, 255, 255)))
            {
                graphics.FillPath(trackBrush, trackPath);
            }

            int travel = Math.Max(1, track.Width - Math.Max(12, track.Width * 44 / 100));
            int phase = animationFrame <= 60 ? animationFrame : 120 - animationFrame;
            int indicatorX = track.Left + travel * phase / 60;
            Rectangle indicator = new Rectangle(indicatorX, track.Top, Math.Max(12, track.Width * 44 / 100), track.Height);
            using (GraphicsPath indicatorPath = RoundedRectangle(indicator, 3))
            using (Brush indicatorBrush = new SolidBrush(Color.FromArgb(101, 216, 255)))
            {
                graphics.FillPath(indicatorBrush, indicatorPath);
            }

            QueueRuntimeStartAfterFirstPaint();
        }

        protected override void OnFormClosing(FormClosingEventArgs eventArgs)
        {
            animationTimer.Stop();
            if (!handoffComplete && runtimeProcess != null)
            {
                try
                {
                    if (!runtimeProcess.HasExited)
                    {
                        runtimeProcess.Kill();
                    }
                }
                catch
                {
                    // The runtime may already be exiting.
                }
            }
            base.OnFormClosing(eventArgs);
        }

        private void QueueRuntimeStartAfterFirstPaint()
        {
            if (runtimeStartQueued)
            {
                return;
            }
            runtimeStartQueued = true;
            BeginInvoke(new Action(delegate
            {
                WriteReadyProbe();
                StartRuntime();
            }));
        }

        private void StartRuntime()
        {
            string runtimeDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RuntimeDirectoryName);
            string runtimeExecutable = Path.Combine(runtimeDirectory, RuntimeExecutableName);
            if (!File.Exists(runtimeExecutable))
            {
                ShowStartupFailure("The player runtime is missing. Keep the complete exported game folder together, then try again.");
                return;
            }

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = runtimeExecutable;
                startInfo.WorkingDirectory = runtimeDirectory;
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = false;
                startInfo.Arguments = BuildForwardedArguments(Environment.GetCommandLineArgs());
                runtimeProcess = Process.Start(startInfo);
                if (runtimeProcess == null)
                {
                    throw new InvalidOperationException("Windows did not return a player process.");
                }
                Task.Factory.StartNew(WaitForRuntimeWindow, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            }
            catch (Exception error)
            {
                ShowStartupFailure("The game could not start. " + error.Message);
            }
        }

        private void WaitForRuntimeWindow()
        {
            try
            {
                bool handedOff = false;
                while (runtimeProcess != null && !runtimeProcess.HasExited)
                {
                    runtimeProcess.Refresh();
                    IntPtr windowHandle = runtimeProcess.MainWindowHandle;
                    if (!handedOff && windowHandle != IntPtr.Zero && IsWindowVisible(windowHandle))
                    {
                        handedOff = true;
                        PostToUi(delegate
                        {
                            handoffComplete = true;
                            TopMost = false;
                            SetForegroundWindow(windowHandle);
                            Hide();
                        });
                    }
                    Thread.Sleep(100);
                }

                if (handedOff)
                {
                    PostToUi(Close);
                    return;
                }
                int exitCode = runtimeProcess == null ? -1 : runtimeProcess.ExitCode;
                PostToUi(delegate
                {
                    ShowStartupFailure("The game closed before its player window was ready (code " + exitCode + ").");
                });
            }
            catch (Exception error)
            {
                PostToUi(delegate { ShowStartupFailure("The game could not finish starting. " + error.Message); });
            }
        }

        private void PostToUi(Action action)
        {
            try
            {
                if (!IsDisposed && IsHandleCreated)
                {
                    BeginInvoke(action);
                }
            }
            catch
            {
                // The launcher may already be closing after a successful handoff.
            }
        }

        private void ShowStartupFailure(string message)
        {
            animationTimer.Stop();
            MessageBox.Show(this, message, projectName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }

        private Rectangle ResolveProgressRectangle()
        {
            int width = Math.Min(260, Math.Max(120, ClientSize.Width / 3));
            return new Rectangle((ClientSize.Width - width) / 2, (int)(ClientSize.Height * 0.48f) + 58, width, 4);
        }

        private static GraphicsPath RoundedRectangle(Rectangle rectangle, int radius)
        {
            int boundedRadius = Math.Max(1, Math.Min(radius, Math.Min(rectangle.Width, rectangle.Height) / 2));
            int diameter = boundedRadius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(rectangle.Left, rectangle.Top, diameter, diameter, 180, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Top, diameter, diameter, 270, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rectangle.Left, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static string ReadProjectName()
        {
            try
            {
                string manifestPath = Path.Combine(
                    AppDomain.CurrentDomain.BaseDirectory,
                    RuntimeDirectoryName,
                    "resources",
                    "player",
                    "build-manifest.json");
                if (File.Exists(manifestPath))
                {
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    Dictionary<string, object> manifest = serializer.Deserialize<Dictionary<string, object>>(
                        File.ReadAllText(manifestPath, Encoding.UTF8));
                    object projectNameValue;
                    if (manifest != null && manifest.TryGetValue("projectName", out projectNameValue))
                    {
                        string value = Convert.ToString(projectNameValue).Trim();
                        if (value.Length > 0)
                        {
                            return value;
                        }
                    }
                }
            }
            catch
            {
                // Fall back to the executable name when the manifest cannot be read.
            }

            string executableName = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
            const string suffix = " Player";
            if (executableName.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            {
                executableName = executableName.Substring(0, executableName.Length - suffix.Length);
            }
            return string.IsNullOrWhiteSpace(executableName) ? "MAGE2 Game" : executableName;
        }

        private static string BuildForwardedArguments(string[] commandLineArguments)
        {
            if (commandLineArguments == null || commandLineArguments.Length <= 1)
            {
                return string.Empty;
            }
            StringBuilder builder = new StringBuilder();
            for (int index = 1; index < commandLineArguments.Length; index += 1)
            {
                if (builder.Length > 0)
                {
                    builder.Append(' ');
                }
                builder.Append(QuoteArgument(commandLineArguments[index]));
            }
            return builder.ToString();
        }

        private static string QuoteArgument(string value)
        {
            if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0)
            {
                return value;
            }

            StringBuilder quoted = new StringBuilder();
            quoted.Append('"');
            int backslashes = 0;
            foreach (char character in value)
            {
                if (character == '\\')
                {
                    backslashes += 1;
                    continue;
                }
                if (character == '"')
                {
                    quoted.Append('\\', backslashes * 2 + 1);
                    quoted.Append('"');
                    backslashes = 0;
                    continue;
                }
                quoted.Append('\\', backslashes);
                backslashes = 0;
                quoted.Append(character);
            }
            quoted.Append('\\', backslashes * 2);
            quoted.Append('"');
            return quoted.ToString();
        }

        private void WriteReadyProbe()
        {
            string probePath = Environment.GetEnvironmentVariable("MAGE2_LAUNCHER_READY_FILE");
            if (string.IsNullOrWhiteSpace(probePath))
            {
                return;
            }
            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> probe = new Dictionary<string, object>();
                probe["visible"] = true;
                probe["projectName"] = projectName;
                probe["reportedAtUtc"] = DateTime.UtcNow.ToString("O");
                string parent = Path.GetDirectoryName(probePath);
                if (!string.IsNullOrEmpty(parent))
                {
                    Directory.CreateDirectory(parent);
                }
                File.WriteAllText(probePath, serializer.Serialize(probe), new UTF8Encoding(false));
            }
            catch
            {
                // Startup probing is optional and must never block the player.
            }
        }
    }
}
