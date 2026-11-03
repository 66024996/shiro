param(
  [Parameter(Mandatory = $true)]
  [string] $RequestJson
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

public static class ShiroWindowsNative
{
    private const uint InputMouse = 0;
    private const uint InputKeyboard = 1;
    private const uint MouseMove = 0x0001;
    private const uint MouseLeftDown = 0x0002;
    private const uint MouseLeftUp = 0x0004;
    private const uint MouseRightDown = 0x0008;
    private const uint MouseRightUp = 0x0010;
    private const uint MouseMiddleDown = 0x0020;
    private const uint MouseMiddleUp = 0x0040;
    private const uint MouseVerticalWheel = 0x0800;
    private const uint MouseHorizontalWheel = 0x1000;
    private const uint MouseVirtualDesk = 0x4000;
    private const uint MouseAbsolute = 0x8000;
    private const uint KeyUp = 0x0002;
    private const uint KeyUnicode = 0x0004;
    private const int MetricVirtualX = 76;
    private const int MetricVirtualY = 77;
    private const int MetricVirtualWidth = 78;
    private const int MetricVirtualHeight = 79;
    private const int ShowNormal = 9;

    public struct ScreenBounds
    {
        public int Left;
        public int Top;
        public int Width;
        public int Height;

        public ScreenBounds(int left, int top, int width, int height)
        {
            Left = left;
            Top = top;
            Width = width;
            Height = height;
        }

        public bool Contains(int x, int y)
        {
            return x >= Left && y >= Top && x < Left + Width && y < Top + Height;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Data;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)]
        public MouseInput Mouse;

        [FieldOffset(0)]
        public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X;
        public int Y;
        public uint Data;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr state);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr state);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximumLength);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int inputSize);

    public static List<Dictionary<string, object>> ListWindows()
    {
        var windows = new List<Dictionary<string, object>>();
        uint currentProcessId = (uint)Process.GetCurrentProcess().Id;
        EnumWindows(delegate (IntPtr window, IntPtr state)
        {
            if (!IsWindowVisible(window))
                return true;

            var title = new StringBuilder(512);
            if (GetWindowText(window, title, title.Capacity) == 0 || title.Length == 0)
                return true;

            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId == currentProcessId)
                return true;

            string processName = null;
            try
            {
                using (var process = Process.GetProcessById((int)processId))
                    processName = process.ProcessName;
            }
            catch (ArgumentException)
            {
                return true;
            }

            windows.Add(new Dictionary<string, object>
            {
                { "windowId", window.ToInt64().ToString(CultureInfo.InvariantCulture) },
                { "processId", processId },
                { "processName", processName },
                { "title", title.ToString() },
            });
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    public static ScreenBounds VirtualScreenBounds()
    {
        return new ScreenBounds(
            GetSystemMetrics(MetricVirtualX),
            GetSystemMetrics(MetricVirtualY),
            GetSystemMetrics(MetricVirtualWidth),
            GetSystemMetrics(MetricVirtualHeight));
    }

    public static void ActivateWindow(string windowId)
    {
        long value;
        if (!Int64.TryParse(windowId, NumberStyles.None, CultureInfo.InvariantCulture, out value))
            throw new ArgumentException("The window ID is not a decimal number.");

        var window = new IntPtr(value);
        uint processId;
        GetWindowThreadProcessId(window, out processId);
        if (!IsWindow(window) || !IsWindowVisible(window) || processId == (uint)Process.GetCurrentProcess().Id)
            throw new InvalidOperationException("The selected window is no longer available.");

        ShowWindowAsync(window, ShowNormal);
        if (!SetForegroundWindow(window))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows did not activate the selected window.");
    }

    public static void Click(int x, int y, string button, int clicks)
    {
        var flags = new Dictionary<string, uint[]>
        {
            { "left", new[] { MouseLeftDown, MouseLeftUp } },
            { "middle", new[] { MouseMiddleDown, MouseMiddleUp } },
            { "right", new[] { MouseRightDown, MouseRightUp } },
        };
        uint[] buttonFlags;
        if (!flags.TryGetValue(button, out buttonFlags))
            throw new ArgumentException("The mouse button is not supported.");

        var inputs = new List<Input>();
        var move = CreateMouseInput(x, y, 0, MouseMove | MouseAbsolute | MouseVirtualDesk);
        inputs.Add(move);
        for (var index = 0; index < clicks; index++)
        {
            inputs.Add(CreateMouseInput(0, 0, 0, buttonFlags[0]));
            inputs.Add(CreateMouseInput(0, 0, 0, buttonFlags[1]));
        }
        Send(inputs);
    }

    public static void Scroll(int x, int y, int deltaX, int deltaY)
    {
        var inputs = new List<Input>
        {
            CreateMouseInput(x, y, 0, MouseMove | MouseAbsolute | MouseVirtualDesk),
        };
        if (deltaY != 0)
            inputs.Add(CreateMouseInput(0, 0, unchecked((uint)deltaY), MouseVerticalWheel));
        if (deltaX != 0)
            inputs.Add(CreateMouseInput(0, 0, unchecked((uint)deltaX), MouseHorizontalWheel));
        Send(inputs);
    }

    public static void TypeText(string text)
    {
        var inputs = new List<Input>(text.Length * 2);
        foreach (var character in text)
        {
            inputs.Add(CreateUnicodeInput(character, KeyUnicode));
            inputs.Add(CreateUnicodeInput(character, KeyUnicode | KeyUp));
        }
        Send(inputs);
    }

    public static void PressKey(string shortcut)
    {
        var parts = shortcut.Split('+');
        var inputs = new List<Input>();
        for (var index = 0; index < parts.Length - 1; index++)
            inputs.Add(CreateVirtualKeyInput(VirtualKey(parts[index]), 0));
        var key = VirtualKey(parts[parts.Length - 1]);
        inputs.Add(CreateVirtualKeyInput(key, 0));
        inputs.Add(CreateVirtualKeyInput(key, KeyUp));
        for (var index = parts.Length - 2; index >= 0; index--)
            inputs.Add(CreateVirtualKeyInput(VirtualKey(parts[index]), KeyUp));
        Send(inputs);
    }

    private static Input CreateMouseInput(int x, int y, uint data, uint flags)
    {
        var bounds = VirtualScreenBounds();
        if ((flags & MouseMove) != 0 && !bounds.Contains(x, y))
            throw new ArgumentOutOfRangeException("x", "The screen position is outside the virtual desktop.");

        var input = new Input { Type = InputMouse };
        input.Data.Mouse = new MouseInput
        {
            X = (flags & MouseMove) != 0 ? Normalize(x, bounds.Left, bounds.Width) : 0,
            Y = (flags & MouseMove) != 0 ? Normalize(y, bounds.Top, bounds.Height) : 0,
            Data = data,
            Flags = flags,
            ExtraInfo = UIntPtr.Zero,
        };
        return input;
    }

    private static int Normalize(int value, int origin, int extent)
    {
        if (extent <= 1)
            return 0;
        return (int)Math.Round((value - origin) * 65535.0 / (extent - 1));
    }

    private static Input CreateUnicodeInput(char character, uint flags)
    {
        var input = new Input { Type = InputKeyboard };
        input.Data.Keyboard = new KeyboardInput
        {
            VirtualKey = 0,
            ScanCode = character,
            Flags = flags,
            ExtraInfo = UIntPtr.Zero,
        };
        return input;
    }

    private static Input CreateVirtualKeyInput(ushort key, uint flags)
    {
        var input = new Input { Type = InputKeyboard };
        input.Data.Keyboard = new KeyboardInput
        {
            VirtualKey = key,
            Flags = flags,
            ExtraInfo = UIntPtr.Zero,
        };
        return input;
    }

    private static ushort VirtualKey(string name)
    {
        var keys = new Dictionary<string, ushort>(StringComparer.Ordinal)
        {
            { "ALT", 0x12 },
            { "BACKSPACE", 0x08 },
            { "CTRL", 0x11 },
            { "DELETE", 0x2E },
            { "DOWN", 0x28 },
            { "END", 0x23 },
            { "ENTER", 0x0D },
            { "ESC", 0x1B },
            { "F4", 0x73 },
            { "F5", 0x74 },
            { "HOME", 0x24 },
            { "LEFT", 0x25 },
            { "RIGHT", 0x27 },
            { "SHIFT", 0x10 },
            { "SPACE", 0x20 },
            { "TAB", 0x09 },
            { "UP", 0x26 },
            { "A", 0x41 },
            { "C", 0x43 },
            { "L", 0x4C },
            { "V", 0x56 },
            { "W", 0x57 },
            { "X", 0x58 },
            { "Z", 0x5A },
        };
        ushort value;
        if (!keys.TryGetValue(name, out value))
            throw new ArgumentException("The key or shortcut is not supported.");
        return value;
    }

    private static void Send(List<Input> inputs)
    {
        var values = inputs.ToArray();
        var sent = SendInput((uint)values.Length, values, Marshal.SizeOf(typeof(Input)));
        if (sent != values.Length)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows did not accept the requested input.");
    }
}
'@

try {
  $request = $RequestJson | ConvertFrom-Json
  if (-not $request.command -or $null -eq $request.arguments) {
    throw 'The Windows desktop request is invalid.'
  }

  $parameters = $request.arguments
  $result = switch ($request.command) {
    'window.list' {
      @{ windows = [ShiroWindowsNative]::ListWindows() }
      break
    }
    'display.list' {
      @{
        displays = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
          @{
            name = $_.DeviceName
            primary = $_.Primary
            left = $_.Bounds.Left
            top = $_.Bounds.Top
            width = $_.Bounds.Width
            height = $_.Bounds.Height
          }
        })
      }
      break
    }
    'display.capture' {
      $root = [System.IO.Path]::GetFullPath($env:SHIRO_COMPUTER_USE_STORE)
      $path = [System.IO.Path]::GetFullPath([string]$request.artifactPath)
      $prefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
      if (-not $path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetExtension($path) -ne '.png') {
        throw 'The screenshot path is outside the computer-use storage directory.'
      }

      $bounds = [ShiroWindowsNative]::VirtualScreenBounds()
      if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
        throw 'Windows did not report valid desktop bounds.'
      }
      [System.IO.Directory]::CreateDirectory($root) | Out-Null
      $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $origin = [System.Drawing.Point]::new($bounds.Left, $bounds.Top)
        $size = [System.Drawing.Size]::new($bounds.Width, $bounds.Height)
        $graphics.CopyFromScreen($origin, [System.Drawing.Point]::Empty, $size)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
      @{
        path = $path
        width = $bounds.Width
        height = $bounds.Height
        originX = $bounds.Left
        originY = $bounds.Top
      }
      break
    }
    'app.activate' {
      [ShiroWindowsNative]::ActivateWindow([string]$parameters.windowId)
      @{ activated = $parameters.windowId }
      break
    }
    'input.clickPoint' {
      [ShiroWindowsNative]::Click([int]$parameters.x, [int]$parameters.y, [string]$parameters.button, [int]$parameters.clicks)
      @{ clicked = $true }
      break
    }
    'input.typeText' {
      [ShiroWindowsNative]::TypeText([string]$parameters.text)
      @{ typed = $true }
      break
    }
    'input.key' {
      [ShiroWindowsNative]::PressKey([string]$parameters.key)
      @{ pressed = $parameters.key }
      break
    }
    'input.scroll' {
      [ShiroWindowsNative]::Scroll([int]$parameters.x, [int]$parameters.y, [int]$parameters.deltaX, [int]$parameters.deltaY)
      @{ scrolled = $true }
      break
    }
    default {
      throw 'This Windows desktop command is not supported.'
    }
  }

  [Console]::WriteLine(($result | ConvertTo-Json -Compress -Depth 8))
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
